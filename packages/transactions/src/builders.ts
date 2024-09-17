import { ApiOpts, ApiParam, IntegerType } from '@stacks/common';
import {
  STACKS_MAINNET,
  STACKS_TESTNET,
  StacksNetwork,
  StacksNetworkName,
  TransactionVersion,
  networkFrom,
  whenTransactionVersion,
} from '@stacks/network';
import { c32address } from 'c32check';
import {
  SpendingCondition,
  createMultiSigSpendingCondition,
  createSingleSigSpendingCondition,
  createSponsoredAuth,
  createStandardAuth,
  isSingleSig,
} from './authorization';
import { ClarityValue, PrincipalCV } from './clarity';
import {
  AddressHashMode,
  AnchorMode,
  ClarityVersion,
  MultiSigHashMode,
  PayloadType,
  PostConditionMode,
  SingleSigHashMode,
} from './constants';
import { ClarityAbi, validateContractCall } from './contract-abi';
import { estimateFee, getAbi, getNonce } from './fetch';
import { createStacksPublicKey, privateKeyToPublic, publicKeyToAddress } from './keys';
import {
  createContractCallPayload,
  createSmartContractPayload,
  createTokenTransferPayload,
} from './payload';
import { PostCondition, PostConditionWire, createAddress } from './postcondition-types';
import { TransactionSigner } from './signer';
import { StacksTransaction } from './transaction';
import { addressFromPublicKeys, createLPList } from './types';
import { defaultApiFromNetwork, omit } from './utils';
import { postConditionToWire } from './postcondition';

/** @deprecated Not used internally */
export interface MultiSigOptions {
  numSignatures: number;
  publicKeys: string[];
  signerKeys?: string[];
}

export interface UnsignedMultiSigOptions {
  /** The minimum required signatures N (in a N of M multi-sig) */
  numSignatures: number;
  /** The M public-keys (in a N of M multi-sig), which together form the address of the multi-sig account */
  publicKeys: string[];
  /**
   * The `address` of the multi-sig account.
   * - If NOT provided, the public-key order is taken AS IS.
   * - If provided, the address will be checked against the order of the public-keys (either AS IS or SORTED).
   * The default is to SORT the public-keys (only if the `address` is provided).
   */
  address?: string;
  /** @experimental Use newer non-sequential multi-sig hashmode for transaction. Future releases may make this the default. */
  useNonSequentialMultiSig?: boolean;
}

export type SignedMultiSigOptions = UnsignedMultiSigOptions & {
  signerKeys: string[];
};

/**
 * STX token transfer transaction options
 *
 * Note: Standard STX transfer does not allow post-conditions.
 */
export type TokenTransferOptions = {
  /** the address of the recipient of the token transfer */
  recipient: string | PrincipalCV;
  /** the amount to be transfered in microstacks */
  amount: IntegerType;
  /** the transaction fee in microstacks */
  fee?: IntegerType;
  /** the transaction nonce, which must be increased monotonically with each new transaction */
  nonce?: IntegerType;
  /** the network that the transaction will ultimately be broadcast to */
  network?: StacksNetworkName | StacksNetwork;
  /** an arbitrary string to include in the transaction, must be less than 34 bytes */
  memo?: string;
  /** set to true if another account is sponsoring the transaction (covering the transaction fee) */
  sponsored?: boolean;
} & ApiParam;

export interface UnsignedTokenTransferOptions extends TokenTransferOptions {
  publicKey: string;
}

export interface SignedTokenTransferOptions extends TokenTransferOptions {
  senderKey: string;
}

export type UnsignedMultiSigTokenTransferOptions = TokenTransferOptions & UnsignedMultiSigOptions;

export type SignedMultiSigTokenTransferOptions = TokenTransferOptions & SignedMultiSigOptions;

/**
 * Generates an unsigned Stacks token transfer transaction
 *
 * Returns a Stacks token transfer transaction.
 *
 * @param {UnsignedTokenTransferOptions | UnsignedMultiSigTokenTransferOptions} txOptions - an options object for the token transfer
 *
 * @return {Promise<StacksTransaction>}
 */
export async function makeUnsignedSTXTokenTransfer(
  txOptions: UnsignedTokenTransferOptions | UnsignedMultiSigTokenTransferOptions
): Promise<StacksTransaction> {
  const defaultOptions = {
    fee: BigInt(0),
    nonce: BigInt(0),
    network: STACKS_MAINNET,
    memo: '',
    sponsored: false,
  };

  const options = Object.assign(defaultOptions, txOptions);
  options.api = defaultApiFromNetwork(options.network, txOptions.api);

  const payload = createTokenTransferPayload(options.recipient, options.amount, options.memo);

  const network = networkFrom(options.network);

  let spendingCondition: SpendingCondition | null = null;

  if ('publicKey' in options) {
    // single-sig
    spendingCondition = createSingleSigSpendingCondition(
      AddressHashMode.SerializeP2PKH,
      options.publicKey,
      options.nonce,
      options.fee
    );
  } else {
    // multi-sig
    const hashMode = options.useNonSequentialMultiSig
      ? AddressHashMode.SerializeP2SHNonSequential
      : AddressHashMode.SerializeP2SH;

    const publicKeys = options.address
      ? sortPublicKeysForAddress(
          options.publicKeys,
          options.numSignatures,
          hashMode,
          createAddress(options.address).hash160
        )
      : options.publicKeys;

    spendingCondition = createMultiSigSpendingCondition(
      hashMode,
      options.numSignatures,
      publicKeys,
      options.nonce,
      options.fee
    );
  }

  const authorization = options.sponsored
    ? createSponsoredAuth(spendingCondition)
    : createStandardAuth(spendingCondition);

  const transaction = new StacksTransaction(
    network.transactionVersion,
    authorization,
    payload,
    undefined, // no post conditions on STX transfers (see SIP-005)
    undefined, // no post conditions on STX transfers (see SIP-005)
    AnchorMode.Any,
    network.chainId
  );

  if (txOptions.fee == null) {
    const fee = await estimateFee({ transaction, api: options.api });
    transaction.setFee(fee);
  }

  if (txOptions.nonce == null) {
    const addressVersion = network.addressVersion.singleSig;
    const address = c32address(addressVersion, transaction.auth.spendingCondition!.signer);
    const txNonce = await getNonce({ address, api: options.api });
    transaction.setNonce(txNonce);
  }

  return transaction;
}

/**
 * Generates a signed Stacks token transfer transaction
 *
 * Returns a signed Stacks token transfer transaction.
 *
 * @param {SignedTokenTransferOptions | SignedMultiSigTokenTransferOptions} txOptions - an options object for the token transfer
 *
 * @return {StacksTransaction}
 */
export async function makeSTXTokenTransfer(
  txOptions: SignedTokenTransferOptions | SignedMultiSigTokenTransferOptions
): Promise<StacksTransaction> {
  if ('senderKey' in txOptions) {
    // single-sig
    const publicKey = privateKeyToPublic(txOptions.senderKey);
    const options = omit(txOptions, 'senderKey');
    const transaction = await makeUnsignedSTXTokenTransfer({ publicKey, ...options });

    const privKey = txOptions.senderKey;
    const signer = new TransactionSigner(transaction);
    signer.signOrigin(privKey);

    return transaction;
  } else {
    // multi-sig
    const options = omit(txOptions, 'signerKeys');
    const transaction = await makeUnsignedSTXTokenTransfer(options);

    mutatingSignAppendMultiSig(
      transaction,
      txOptions.publicKeys.slice(),
      txOptions.signerKeys,
      txOptions.address
    );

    return transaction;
  }
}

/**
 * Contract deploy transaction options
 */
export interface BaseContractDeployOptions {
  clarityVersion?: ClarityVersion;
  contractName: string;
  /** the Clarity code to be deployed */
  codeBody: string;
  /** transaction fee in microstacks */
  fee?: IntegerType;
  /** the transaction nonce, which must be increased monotonically with each new transaction */
  nonce?: IntegerType;
  /** the network that the transaction will ultimately be broadcast to */
  network?: StacksNetworkName | StacksNetwork;
  /** the node/API used for estimating fee & nonce (using the `api.fetchFn` */
  api?: ApiOpts;
  /** the post condition mode, specifying whether or not post-conditions must fully cover all
   * transfered assets */
  postConditionMode?: PostConditionMode;
  /** a list of post conditions to add to the transaction */
  postConditions?: PostConditionWire[];
  /** set to true if another account is sponsoring the transaction (covering the transaction fee) */
  sponsored?: boolean;
}

export interface UnsignedContractDeployOptions extends BaseContractDeployOptions {
  /** a hex string of the public key of the transaction sender */
  publicKey: string;
}

export interface SignedContractDeployOptions extends BaseContractDeployOptions {
  senderKey: string;
}

/** @deprecated Use {@link SignedContractDeployOptions} or {@link UnsignedContractDeployOptions} instead. */
export interface ContractDeployOptions extends SignedContractDeployOptions {}

export type UnsignedMultiSigContractDeployOptions = BaseContractDeployOptions &
  UnsignedMultiSigOptions;

export type SignedMultiSigContractDeployOptions = BaseContractDeployOptions & SignedMultiSigOptions;

/**
 * Generates a Clarity smart contract deploy transaction
 *
 * @param {SignedContractDeployOptions | SignedMultiSigContractDeployOptions} txOptions - an options object for the contract deploy
 *
 * Returns a signed Stacks smart contract deploy transaction.
 *
 * @return {StacksTransaction}
 */
export async function makeContractDeploy(
  txOptions: SignedContractDeployOptions | SignedMultiSigContractDeployOptions
): Promise<StacksTransaction> {
  if ('senderKey' in txOptions) {
    // single-sig
    const publicKey = privateKeyToPublic(txOptions.senderKey);
    const options = omit(txOptions, 'senderKey');
    const transaction = await makeUnsignedContractDeploy({ publicKey, ...options });

    const privKey = txOptions.senderKey;
    const signer = new TransactionSigner(transaction);
    signer.signOrigin(privKey);

    return transaction;
  } else {
    // multi-sig
    const options = omit(txOptions, 'signerKeys');
    const transaction = await makeUnsignedContractDeploy(options);

    mutatingSignAppendMultiSig(
      transaction,
      txOptions.publicKeys.slice(),
      txOptions.signerKeys,
      txOptions.address
    );

    return transaction;
  }
}

export async function makeUnsignedContractDeploy(
  txOptions: UnsignedContractDeployOptions | UnsignedMultiSigContractDeployOptions
): Promise<StacksTransaction> {
  const defaultOptions = {
    fee: BigInt(0),
    nonce: BigInt(0),
    network: STACKS_MAINNET,
    postConditionMode: PostConditionMode.Deny,
    sponsored: false,
    clarityVersion: ClarityVersion.Clarity2,
  };

  const options = Object.assign(defaultOptions, txOptions);
  options.api = defaultApiFromNetwork(options.network, txOptions.api);

  const payload = createSmartContractPayload(
    options.contractName,
    options.codeBody,
    options.clarityVersion
  );

  const network = networkFrom(options.network);

  let spendingCondition: SpendingCondition | null = null;

  if ('publicKey' in options) {
    // single-sig
    spendingCondition = createSingleSigSpendingCondition(
      AddressHashMode.SerializeP2PKH,
      options.publicKey,
      options.nonce,
      options.fee
    );
  } else {
    // multi-sig
    const hashMode = options.useNonSequentialMultiSig
      ? AddressHashMode.SerializeP2SHNonSequential
      : AddressHashMode.SerializeP2SH;

    const publicKeys = options.address
      ? sortPublicKeysForAddress(
          options.publicKeys,
          options.numSignatures,
          hashMode,
          createAddress(options.address).hash160
        )
      : options.publicKeys;

    spendingCondition = createMultiSigSpendingCondition(
      hashMode,
      options.numSignatures,
      publicKeys,
      options.nonce,
      options.fee
    );
  }

  const authorization = options.sponsored
    ? createSponsoredAuth(spendingCondition)
    : createStandardAuth(spendingCondition);

  const postConditions: PostConditionWire[] = [];
  if (options.postConditions && options.postConditions.length > 0) {
    options.postConditions.forEach(postCondition => {
      postConditions.push(postCondition);
    });
  }
  const lpPostConditions = createLPList(postConditions);

  const transaction = new StacksTransaction(
    network.transactionVersion,
    authorization,
    payload,
    lpPostConditions,
    options.postConditionMode,
    AnchorMode.Any,
    network.chainId
  );

  if (txOptions.fee === undefined || txOptions.fee === null) {
    const fee = await estimateFee({ transaction, api: options.api });
    transaction.setFee(fee);
  }

  if (txOptions.nonce === undefined || txOptions.nonce === null) {
    const addressVersion = network.addressVersion.singleSig;
    const address = c32address(addressVersion, transaction.auth.spendingCondition!.signer);
    const txNonce = await getNonce({ address, api: options.api });
    transaction.setNonce(txNonce);
  }

  return transaction;
}

/**
 * Contract function call transaction options
 */
export interface ContractCallOptions {
  /** the Stacks address of the contract */
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  /** transaction fee in microstacks */
  fee?: IntegerType;
  /** the transaction nonce, which must be increased monotonically with each new transaction */
  nonce?: IntegerType;
  /** the Stacks blockchain network that will ultimately be used to broadcast this transaction */
  network?: StacksNetworkName | StacksNetwork;
  /** the node/API used for estimating fee & nonce (using the `api.fetchFn` */
  api?: ApiOpts;
  /** the post condition mode, specifying whether or not post-conditions must fully cover all
   * transfered assets */
  postConditionMode?: PostConditionMode;
  /** a list of post conditions to add to the transaction */
  postConditions?: PostCondition[];
  /** set to true to validate that the supplied function args match those specified in
   * the published contract */
  validateWithAbi?: boolean | ClarityAbi;
  /** set to true if another account is sponsoring the transaction (covering the transaction fee) */
  sponsored?: boolean;
}

export interface UnsignedContractCallOptions extends ContractCallOptions {
  publicKey: string;
}

export interface SignedContractCallOptions extends ContractCallOptions {
  senderKey: string;
}

export type UnsignedMultiSigContractCallOptions = ContractCallOptions & UnsignedMultiSigOptions;

export type SignedMultiSigContractCallOptions = ContractCallOptions & SignedMultiSigOptions;

/**
 * Generates an unsigned Clarity smart contract function call transaction
 *
 * @param {UnsignedContractCallOptions | UnsignedMultiSigContractCallOptions} txOptions - an options object for the contract call
 *
 * @returns {Promise<StacksTransaction>}
 */
export async function makeUnsignedContractCall(
  txOptions: UnsignedContractCallOptions | UnsignedMultiSigContractCallOptions
): Promise<StacksTransaction> {
  const defaultOptions = {
    fee: BigInt(0),
    nonce: BigInt(0),
    network: STACKS_MAINNET,
    postConditionMode: PostConditionMode.Deny,
    sponsored: false,
  };

  const options = Object.assign(defaultOptions, txOptions);
  options.api = defaultApiFromNetwork(options.network, txOptions.api);

  const payload = createContractCallPayload(
    options.contractAddress,
    options.contractName,
    options.functionName,
    options.functionArgs
  );

  if (options?.validateWithAbi) {
    let abi: ClarityAbi;
    if (typeof options.validateWithAbi === 'boolean') {
      if (options?.network) {
        abi = await getAbi({ ...options });
      } else {
        throw new Error('Network option must be provided in order to validate with ABI');
      }
    } else {
      abi = options.validateWithAbi;
    }

    validateContractCall(payload, abi);
  }

  const network = networkFrom(options.network);

  let spendingCondition: SpendingCondition | null = null;

  if ('publicKey' in options) {
    // single-sig
    spendingCondition = createSingleSigSpendingCondition(
      AddressHashMode.SerializeP2PKH,
      options.publicKey,
      options.nonce,
      options.fee
    );
  } else {
    // multi-sig
    const hashMode = options.useNonSequentialMultiSig
      ? AddressHashMode.SerializeP2SHNonSequential
      : AddressHashMode.SerializeP2SH;

    const publicKeys = options.address
      ? sortPublicKeysForAddress(
          options.publicKeys,
          options.numSignatures,
          hashMode,
          createAddress(options.address).hash160
        )
      : options.publicKeys;

    spendingCondition = createMultiSigSpendingCondition(
      hashMode,
      options.numSignatures,
      publicKeys,
      options.nonce,
      options.fee
    );
  }

  const authorization = options.sponsored
    ? createSponsoredAuth(spendingCondition)
    : createStandardAuth(spendingCondition);

  const postConditions = (options.postConditions ?? []).map(
    postConditionToWire as (post: PostCondition) => PostConditionWire
  );
  const lpPostConditions = createLPList(postConditions);

  const transaction = new StacksTransaction(
    network.transactionVersion,
    authorization,
    payload,
    lpPostConditions,
    options.postConditionMode,
    AnchorMode.Any,
    network.chainId
  );

  if (txOptions.fee === undefined || txOptions.fee === null) {
    const fee = await estimateFee({ transaction, api: options.api });
    transaction.setFee(fee);
  }

  if (txOptions.nonce === undefined || txOptions.nonce === null) {
    const addressVersion = network.addressVersion.singleSig;
    const address = c32address(addressVersion, transaction.auth.spendingCondition!.signer);
    const txNonce = await getNonce({ address, api: options.api });
    transaction.setNonce(txNonce);
  }

  return transaction;
}

/**
 * Generates a Clarity smart contract function call transaction
 *
 * @param {SignedContractCallOptions | SignedMultiSigContractCallOptions} txOptions - an options object for the contract function call
 *
 * Returns a signed Stacks smart contract function call transaction.
 *
 * @return {StacksTransaction}
 */
export async function makeContractCall(
  txOptions: SignedContractCallOptions | SignedMultiSigContractCallOptions
): Promise<StacksTransaction> {
  if ('senderKey' in txOptions) {
    // single-sig
    const publicKey = privateKeyToPublic(txOptions.senderKey);
    const options = omit(txOptions, 'senderKey');
    const transaction = await makeUnsignedContractCall({ publicKey, ...options });

    const privKey = txOptions.senderKey;
    const signer = new TransactionSigner(transaction);
    signer.signOrigin(privKey);

    return transaction;
  } else {
    // multi-sig
    const options = omit(txOptions, 'signerKeys');
    const transaction = await makeUnsignedContractCall(options);

    mutatingSignAppendMultiSig(
      transaction,
      txOptions.publicKeys.slice(),
      txOptions.signerKeys,
      txOptions.address
    );

    return transaction;
  }
}

/**
 * Sponsored transaction options
 */
export interface SponsorOptionsOpts {
  /** the origin-signed transaction */
  transaction: StacksTransaction;
  /** the sponsor's private key */
  sponsorPrivateKey: string;
  /** the transaction fee amount to sponsor */
  fee?: IntegerType;
  /** the nonce of the sponsor account */
  sponsorNonce?: IntegerType;
  /** the hashmode of the sponsor's address */
  sponsorAddressHashmode?: AddressHashMode;
  /** the Stacks blockchain network that this transaction will ultimately be broadcast to */
  network?: StacksNetworkName | StacksNetwork;
  /** the node/API used for estimating fee & nonce (using the `api.fetchFn` */
  api?: ApiOpts;
}

/**
 * Constructs and signs a sponsored transaction as the sponsor
 *
 * @param {SponsorOptionsOpts} sponsorOptions - the sponsor options object
 *
 * Returns a signed sponsored transaction.
 *
 * @return {ClarityValue}
 */
export async function sponsorTransaction(
  sponsorOptions: SponsorOptionsOpts
): Promise<StacksTransaction> {
  const defaultNetwork = whenTransactionVersion(sponsorOptions.transaction.version)({
    [TransactionVersion.Mainnet]: STACKS_MAINNET,
    [TransactionVersion.Testnet]: STACKS_TESTNET,
  }); // detect network from transaction version

  const defaultOptions = {
    fee: 0 as IntegerType,
    sponsorNonce: 0 as IntegerType,
    sponsorAddressHashmode: AddressHashMode.SerializeP2PKH as SingleSigHashMode,
    network: defaultNetwork,
  };

  const options = Object.assign(defaultOptions, sponsorOptions);
  options.api = defaultApiFromNetwork(options.network, sponsorOptions.api);

  const network = networkFrom(options.network);
  const sponsorPubKey = privateKeyToPublic(options.sponsorPrivateKey);

  if (sponsorOptions.fee == null) {
    let txFee: bigint | number = 0;
    switch (options.transaction.payload.payloadType) {
      case PayloadType.TokenTransfer:
      case PayloadType.SmartContract:
      case PayloadType.VersionedSmartContract:
      case PayloadType.ContractCall:
        txFee = BigInt(await estimateFee({ ...options }));
        break;
      default:
        throw new Error(
          `Sponsored transactions not supported for transaction type ${
            PayloadType[options.transaction.payload.payloadType]
          }`
        );
    }
    options.transaction.setFee(txFee);
    options.fee = txFee;
  }

  if (sponsorOptions.sponsorNonce == null) {
    const addressVersion = network.addressVersion.singleSig;
    const address = publicKeyToAddress(addressVersion, sponsorPubKey);
    const sponsorNonce = await getNonce({ address, api: options.api });
    options.sponsorNonce = sponsorNonce;
  }

  const sponsorSpendingCondition = createSingleSigSpendingCondition(
    options.sponsorAddressHashmode,
    sponsorPubKey,
    options.sponsorNonce,
    options.fee
  );

  options.transaction.setSponsor(sponsorSpendingCondition);

  const privKey = options.sponsorPrivateKey;
  const signer = TransactionSigner.createSponsorSigner(
    options.transaction,
    sponsorSpendingCondition
  );
  signer.signSponsor(privKey);

  return signer.transaction;
}

/** @internal multi-sig signing re-use */
function mutatingSignAppendMultiSig(
  /** **Warning:** method mutates `transaction` */
  transaction: StacksTransaction,
  publicKeys: string[],
  signerKeys: string[],
  address?: string
) {
  if (isSingleSig(transaction.auth.spendingCondition)) {
    throw new Error('Transaction is not a multi-sig transaction');
  }

  const signer = new TransactionSigner(transaction);

  const pubs = address
    ? sortPublicKeysForAddress(
        publicKeys,
        transaction.auth.spendingCondition.signaturesRequired,
        transaction.auth.spendingCondition.hashMode,
        createAddress(address).hash160
      )
    : publicKeys;

  // sign in order of public keys
  for (const publicKey of pubs) {
    const signerKey = signerKeys.find(key => privateKeyToPublic(key) === publicKey);
    if (signerKey) {
      // either sign and append message signature (which allows for recovering the public key)
      signer.signOrigin(signerKey);
    } else {
      // or append the public key (which did not sign here)
      // todo: remove wrapper type here as well `next`
      signer.appendOrigin(createStacksPublicKey(publicKey));
    }
  }
}

/** @internal Get the matching public-keys array for a multi-sig address */
function sortPublicKeysForAddress(
  publicKeys: string[],
  numSigs: number,
  hashMode: MultiSigHashMode,
  hash: string
): string[] {
  // unsorted
  const hashUnsorted = addressFromPublicKeys(
    0 as any, // only used for hash, so version doesn't matter
    hashMode,
    numSigs,
    publicKeys.map(createStacksPublicKey)
  ).hash160;

  if (hashUnsorted === hash) return publicKeys;

  // sorted
  const publicKeysSorted = publicKeys.slice().sort();
  const hashSorted = addressFromPublicKeys(
    0 as any, // only used for hash, so version doesn't matter
    hashMode,
    numSigs,
    publicKeysSorted.map(createStacksPublicKey)
  ).hash160;

  if (hashSorted === hash) return publicKeysSorted;

  throw new Error('Failed to find matching multi-sig address given public-keys.');
}
