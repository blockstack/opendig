import { bytesToHex, hexToBytes } from '@stacks/common';
import { DEFAULT_CHAIN_ID, TransactionVersion } from '@stacks/network';
import fetchMock from 'jest-fetch-mock';
import { BytesReader } from '../src/BytesReader';
import {
  MultiSigSpendingCondition,
  SingleSigSpendingCondition,
  SponsoredAuthorization,
  createMultiSigSpendingCondition,
  createSingleSigSpendingCondition,
  createSponsoredAuth,
  createStandardAuth,
} from '../src/authorization';
import { contractPrincipalCV, standardPrincipalCV } from '../src/clarity';
import {
  AddressHashMode,
  AnchorMode,
  AuthType,
  FungibleConditionCode,
  PostConditionMode,
} from '../src/constants';
import { createStacksPublicKey, privateKeyToPublic, publicKeyToHex } from '../src/keys';

import {
  CoinbasePayloadToAltRecipient,
  Pc,
  STXPostConditionWire,
  TokenTransferPayloadWire,
  createLPList,
  createStandardPrincipal,
  createTokenTransferPayload,
  serializePublicKeyBytes,
} from '../src';
import { postConditionToWire } from '../src/postcondition';
import { TransactionSigner } from '../src/signer';
import {
  StacksTransaction,
  deserializeTransaction,
  serializeTransaction,
  transactionToHex,
} from '../src/transaction';

beforeEach(() => {
  fetchMock.resetMocks();
});

test('STX token transfer transaction serialization and deserialization', () => {
  const transactionVersion = TransactionVersion.Testnet;
  const chainId = DEFAULT_CHAIN_ID;

  const anchorMode = AnchorMode.Any;
  const postConditionMode = PostConditionMode.Deny;

  const address = 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159';
  const recipient = createStandardPrincipal(address);
  const recipientCV = standardPrincipalCV(address);
  const amount = 2500000;
  const memo = 'memo (not included';

  const payload = createTokenTransferPayload(recipientCV, amount, memo);

  const addressHashMode = AddressHashMode.SerializeP2PKH;
  const nonce = 0;
  const fee = 0;
  const pubKey = '03ef788b3830c00abe8f64f62dc32fc863bc0b2cafeb073b6c8e1c7657d9c2c3ab';
  const secretKey = 'edf9aee84d9b7abc145504dde6726c64f369d37ee34ded868fabd876c26570bc01';
  const spendingCondition = createSingleSigSpendingCondition(addressHashMode, pubKey, nonce, fee);
  const authType = AuthType.Standard;
  const authorization = createStandardAuth(spendingCondition);

  const postCondition = postConditionToWire({
    type: 'stx-postcondition',
    address,
    condition: 'gte',
    amount: 0,
  });

  const postConditions = createLPList([postCondition]);
  const transaction = new StacksTransaction(
    transactionVersion,
    authorization,
    payload,
    postConditions
  );

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(secretKey);
  // const signature =
  //   '01051521ac2ac6e6123dcaf9dba000e0005d9855bcc1bc6b96aaf8b6a385238a2317' +
  //   'ab21e489aca47af3288cdaebd358b0458a9159cadc314cecb7dd08043c0a6d';

  transaction.verifyOrigin();

  const serialized = transaction.serializeBytes();
  const deserialized = deserializeTransaction(new BytesReader(serialized));

  const serializedHexString = bytesToHex(serialized);
  expect(deserializeTransaction(serializedHexString).serialize()).toEqual(bytesToHex(serialized));

  const serializedHexStringPrefixed = '0x' + serializedHexString;
  expect(deserializeTransaction(serializedHexStringPrefixed).serialize()).toEqual(
    bytesToHex(serialized)
  );

  expect(deserialized.version).toBe(transactionVersion);
  expect(deserialized.chainId).toBe(chainId);
  expect(deserialized.auth.authType).toBe(authType);
  expect((deserialized.auth.spendingCondition! as SingleSigSpendingCondition).hashMode).toBe(
    addressHashMode
  );
  expect(deserialized.auth.spendingCondition!.nonce!.toString()).toBe(nonce.toString());
  expect(deserialized.auth.spendingCondition!.fee!.toString()).toBe(fee.toString());
  expect(deserialized.anchorMode).toBe(anchorMode);
  expect(deserialized.postConditionMode).toBe(postConditionMode);
  expect(deserialized.postConditions.values.length).toBe(1);

  const deserializedPostCondition = deserialized.postConditions.values[0] as STXPostConditionWire;
  if (!('address' in deserializedPostCondition.principal)) throw TypeError;
  expect(deserializedPostCondition.principal.address).toStrictEqual(recipient.address);
  expect(deserializedPostCondition.conditionCode).toBe(FungibleConditionCode.GreaterEqual);
  expect(deserializedPostCondition.amount.toString()).toBe('0');

  const deserializedPayload = deserialized.payload as TokenTransferPayloadWire;
  expect(deserializedPayload.recipient).toEqual(recipientCV);
  expect(deserializedPayload.amount.toString()).toBe(amount.toString());
});

test('STX token transfer transaction fee setting', () => {
  const transactionVersion = TransactionVersion.Testnet;
  const chainId = DEFAULT_CHAIN_ID;

  const anchorMode = AnchorMode.Any;
  const postConditionMode = PostConditionMode.Deny;

  const address = 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159';
  const recipient = createStandardPrincipal(address);
  const recipientCV = standardPrincipalCV(address);
  const amount = 2500000;
  const memo = 'memo (not included';

  const payload = createTokenTransferPayload(recipientCV, amount, memo);

  const addressHashMode = AddressHashMode.SerializeP2PKH;
  const nonce = 0;
  const fee = 0;
  const pubKey = '03ef788b3830c00abe8f64f62dc32fc863bc0b2cafeb073b6c8e1c7657d9c2c3ab';
  const secretKey = 'edf9aee84d9b7abc145504dde6726c64f369d37ee34ded868fabd876c26570bc01';
  const spendingCondition = createSingleSigSpendingCondition(addressHashMode, pubKey, nonce, fee);
  const authType = AuthType.Standard;
  const authorization = createStandardAuth(spendingCondition);

  const postCondition = postConditionToWire(Pc.principal(address).willSendGte(0).ustx());

  const postConditions = createLPList([postCondition]);

  const transaction = new StacksTransaction(
    transactionVersion,
    authorization,
    payload,
    postConditions
  );

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(secretKey);
  // const signature =
  //   '01051521ac2ac6e6123dcaf9dba000e0005d9855bcc1bc6b96aaf8b6a385238a2317' +
  //   'ab21e489aca47af3288cdaebd358b0458a9159cadc314cecb7dd08043c0a6d';

  transaction.verifyOrigin();

  const serialized = transaction.serializeBytes();
  const deserialized = deserializeTransaction(new BytesReader(serialized));
  expect(deserialized.auth.spendingCondition!.fee!.toString()).toBe(fee.toString());

  const setFee = 123;
  transaction.setFee(setFee);

  const postSetFeeSerialized = transaction.serializeBytes();
  const postSetFeeDeserialized = deserializeTransaction(new BytesReader(postSetFeeSerialized));
  expect(postSetFeeDeserialized.version).toBe(transactionVersion);
  expect(postSetFeeDeserialized.chainId).toBe(chainId);
  expect(postSetFeeDeserialized.auth.authType).toBe(authType);
  expect(
    (postSetFeeDeserialized.auth.spendingCondition! as SingleSigSpendingCondition).hashMode
  ).toBe(addressHashMode);
  expect(postSetFeeDeserialized.auth.spendingCondition!.nonce!.toString()).toBe(nonce.toString());
  expect(postSetFeeDeserialized.auth.spendingCondition!.fee!.toString()).toBe(setFee.toString());
  expect(postSetFeeDeserialized.anchorMode).toBe(anchorMode);
  expect(postSetFeeDeserialized.postConditionMode).toBe(postConditionMode);
  expect(postSetFeeDeserialized.postConditions.values.length).toBe(1);

  const deserializedPostCondition = postSetFeeDeserialized.postConditions
    .values[0] as STXPostConditionWire;
  if (!('address' in deserializedPostCondition.principal)) throw TypeError;
  expect(deserializedPostCondition.principal.address).toStrictEqual(recipient.address);
  expect(deserializedPostCondition.conditionCode).toBe(FungibleConditionCode.GreaterEqual);
  expect(deserializedPostCondition.amount.toString()).toBe('0');

  const deserializedPayload = postSetFeeDeserialized.payload as TokenTransferPayloadWire;
  expect(deserializedPayload.recipient).toEqual(recipientCV);
  expect(deserializedPayload.amount.toString()).toBe(amount.toString());
});

test('STX token transfer transaction multi-sig serialization and deserialization', () => {
  const addressHashMode = AddressHashMode.SerializeP2SH;
  const nonce = 0;
  const fee = 0;

  const privKeys = [
    '6d430bb91222408e7706c9001cfaeb91b08c2be6d5ac95779ab52c6b431950e001',
    '2a584d899fed1d24e26b524f202763c8ab30260167429f157f1c119f550fa6af01',
    'd5200dee706ee53ae98a03fba6cf4fdcc5084c30cfa9e1b3462dcdeaa3e0f1d201',
  ];

  const pubKeys = privKeys.map(privateKeyToPublic).map(createStacksPublicKey);
  const pubKeyStrings = pubKeys.map(serializePublicKeyBytes).map(publicKeyToHex);

  const spendingCondition = createMultiSigSpendingCondition(
    addressHashMode,
    2,
    pubKeyStrings,
    nonce,
    fee
  );
  const authType = AuthType.Standard;
  const originAuth = createStandardAuth(spendingCondition);

  const originAddress = originAuth.spendingCondition?.signer;

  expect(originAddress).toEqual('a23ea89d6529ac48ac766f720e480beec7f19273');

  const transactionVersion = TransactionVersion.Mainnet;
  const chainId = DEFAULT_CHAIN_ID;

  const anchorMode = AnchorMode.Any;

  const address = 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159';
  const recipientCV = standardPrincipalCV(address);
  const amount = 2500000;

  const memo = 'memo';

  const payload = createTokenTransferPayload(recipientCV, amount, memo);

  const transaction = new StacksTransaction(transactionVersion, originAuth, payload);

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(privKeys[0]);
  signer.signOrigin(privKeys[1]);
  signer.appendOrigin(pubKeys[2]);

  transaction.verifyOrigin();

  const serialized = transaction.serializeBytes();
  const deserialized = deserializeTransaction(new BytesReader(serialized));
  expect(deserialized.version).toBe(transactionVersion);
  expect(deserialized.chainId).toBe(chainId);
  expect(deserialized.auth.authType).toBe(authType);
  expect((deserialized.auth.spendingCondition! as MultiSigSpendingCondition).hashMode).toBe(
    addressHashMode
  );
  expect(deserialized.auth.spendingCondition!.nonce!.toString()).toBe(nonce.toString());
  expect(deserialized.auth.spendingCondition!.fee!.toString()).toBe(fee.toString());
  expect(deserialized.anchorMode).toBe(anchorMode);
  expect(deserialized.postConditionMode).toBe(PostConditionMode.Deny);
  expect(deserialized.postConditions.values.length).toBe(0);

  const deserializedPayload = deserialized.payload as TokenTransferPayloadWire;
  expect(deserializedPayload.recipient).toEqual(recipientCV);
  expect(deserializedPayload.amount.toString()).toBe(amount.toString());
});

test('STX token transfer transaction multi-sig uncompressed keys serialization and deserialization', () => {
  const nonce = 0;
  const fee = 0;

  const privKeys = [
    '6d430bb91222408e7706c9001cfaeb91b08c2be6d5ac95779ab52c6b431950e0',
    '2a584d899fed1d24e26b524f202763c8ab30260167429f157f1c119f550fa6af',
    'd5200dee706ee53ae98a03fba6cf4fdcc5084c30cfa9e1b3462dcdeaa3e0f1d2',
  ];

  const pubKeys = privKeys.map(privateKeyToPublic).map(createStacksPublicKey);
  const pubKeyStrings = pubKeys.map(serializePublicKeyBytes).map(publicKeyToHex);

  expect(() =>
    createMultiSigSpendingCondition(AddressHashMode.SerializeP2WSH, 2, pubKeyStrings, nonce, fee)
  ).toThrowError('Public keys must be compressed for segwit');

  const spendingCondition = createMultiSigSpendingCondition(
    AddressHashMode.SerializeP2SH, // will be replaced in the next step
    2,
    pubKeyStrings,
    nonce,
    fee
  );
  spendingCondition.hashMode = AddressHashMode.SerializeP2WSH;

  const originAuth = createStandardAuth(spendingCondition);
  const originAddress = originAuth.spendingCondition?.signer;
  expect(originAddress).toEqual('73a8b4a751a678fe83e9d35ce301371bb3d397f7');

  const transactionVersion = TransactionVersion.Mainnet;
  const address = 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159';
  const recipientCV = standardPrincipalCV(address);
  const amount = 2500000;

  const memo = 'memo';

  const payload = createTokenTransferPayload(recipientCV, amount, memo);

  const transaction = new StacksTransaction(transactionVersion, originAuth, payload);

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(privKeys[0]);
  signer.signOrigin(privKeys[1]);
  signer.appendOrigin(pubKeys[2]);

  const expectedError = 'Uncompressed keys are not allowed in this hash mode';
  expect(() => transaction.verifyOrigin()).toThrow(expectedError);

  const serialized = transaction.serialize();
  expect(() => deserializeTransaction(serialized)).toThrow(expectedError);
});

test('Sponsored STX token transfer transaction serialization and deserialization', () => {
  const transactionVersion = TransactionVersion.Testnet;
  const chainId = DEFAULT_CHAIN_ID;

  const anchorMode = AnchorMode.Any;
  const postConditionMode = PostConditionMode.Deny;

  const address = 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159';
  // const recipient = createStandardPrincipal(address);
  const recipientCV = standardPrincipalCV(address);
  const amount = 2500000;
  const memo = 'memo (not included';

  const payload = createTokenTransferPayload(recipientCV, amount, memo);

  const addressHashMode = AddressHashMode.SerializeP2PKH;
  const nonce = 0;
  const sponsorNonce = 123;
  const fee = 0;
  const pubKey = '03ef788b3830c00abe8f64f62dc32fc863bc0b2cafeb073b6c8e1c7657d9c2c3ab';
  const secretKey = 'edf9aee84d9b7abc145504dde6726c64f369d37ee34ded868fabd876c26570bc01';
  const sponsorPubKey = '02b6cfeae7cdcd7ae9229e2decc7d75fe727f8dc9f0d81e58aaf46de550d8e3f58';
  const sponsorSecretKey = '3372fdabb09819bb6c9446da8a067840c81dcf8d229d048de36caac3562c5f7301';
  const spendingCondition = createSingleSigSpendingCondition(addressHashMode, pubKey, nonce, fee);
  const sponsorSpendingCondition = createSingleSigSpendingCondition(
    addressHashMode,
    sponsorPubKey,
    sponsorNonce,
    fee
  );

  const authType = AuthType.Sponsored;
  const authorization = createSponsoredAuth(spendingCondition, sponsorSpendingCondition);

  const transaction = new StacksTransaction(transactionVersion, authorization, payload);

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(secretKey);
  signer.signSponsor(sponsorSecretKey);

  transaction.verifyOrigin();

  const serialized = transaction.serialize();
  const deserialized = deserializeTransaction(serialized);
  expect(deserialized.version).toBe(transactionVersion);
  expect(deserialized.chainId).toBe(chainId);
  expect(deserialized.auth.authType).toBe(authType);
  expect(deserialized.auth.spendingCondition!.hashMode).toBe(addressHashMode);
  expect(deserialized.auth.spendingCondition!.nonce!.toString()).toBe(nonce.toString());
  expect(deserialized.auth.spendingCondition!.fee!.toString()).toBe(fee.toString());
  expect((deserialized.auth as SponsoredAuthorization).sponsorSpendingCondition!.hashMode).toBe(
    addressHashMode
  );
  expect(
    (deserialized.auth as SponsoredAuthorization).sponsorSpendingCondition!.nonce!.toString()
  ).toBe(sponsorNonce.toString());
  expect(
    (deserialized.auth as SponsoredAuthorization).sponsorSpendingCondition!.fee!.toString()
  ).toBe(fee.toString());
  expect(deserialized.anchorMode).toBe(anchorMode);
  expect(deserialized.postConditionMode).toBe(postConditionMode);

  const deserializedPayload = deserialized.payload as TokenTransferPayloadWire;
  expect(deserializedPayload.recipient).toEqual(recipientCV);
  expect(deserializedPayload.amount.toString()).toBe(amount.toString());
});

test('Coinbase pay to alt standard principal recipient deserialization', () => {
  // todo: serialization from real private key
  const serializedTx =
    '0x80800000000400fd3cd910d78fe7c4cd697d5228e51a912ff2ba740000000000000004000000000000000001008d36064b250dba5d3221ac235a9320adb072cfc23cd63511e6d814f97f0302e66c2ece80d7512df1b3e90ca6dce18179cb67b447973c739825ce6c6756bc247d010200000000050000000000000000000000000000000000000000000000000000000000000000051aba27f99e007c7f605a8305e318c1abde3cd220ac';
  const deserializedTx = deserializeTransaction(serializedTx);

  expect(deserializedTx.anchorMode).toBe(AnchorMode.OnChainOnly);
  expect((deserializedTx.auth.spendingCondition as SingleSigSpendingCondition).signature.data).toBe(
    '008d36064b250dba5d3221ac235a9320adb072cfc23cd63511e6d814f97f0302e66c2ece80d7512df1b3e90ca6dce18179cb67b447973c739825ce6c6756bc247d'
  );
  expect((deserializedTx.payload as CoinbasePayloadToAltRecipient).coinbaseBytes).toEqual(
    hexToBytes('0'.repeat(64))
  );
  expect((deserializedTx.payload as CoinbasePayloadToAltRecipient).recipient).toEqual(
    standardPrincipalCV('ST2X2FYCY01Y7YR2TGC2Y6661NFF3SMH0NGXPWTV5')
  );
  expect(deserializedTx.txid()).toBe(
    '449f5ea5c541bbbbbf7a1bff2434c449dca2ae3cdc52ba8d24b0bd0d3632d9bc'
  );
  expect(deserializedTx.version).toBe(TransactionVersion.Testnet);
});

test('Coinbase pay to alt contract principal recipient deserialization', () => {
  // todo: serialization from real private key
  const serializedTx =
    '0x8080000000040055a0a92720d20398211cd4c7663d65d018efcc1f00000000000000030000000000000000010118da31f542913e8c56961b87ee4794924e655a28a2034e37ef4823eeddf074747285bd6efdfbd84eecdf62cffa7c1864e683c688f4c105f4db7429066735b4e2010200000000050000000000000000000000000000000000000000000000000000000000000000061aba27f99e007c7f605a8305e318c1abde3cd220ac0b68656c6c6f5f776f726c64';
  const deserializedTx = deserializeTransaction(serializedTx);

  expect(deserializedTx.anchorMode).toBe(AnchorMode.OnChainOnly);
  expect((deserializedTx.auth.spendingCondition as SingleSigSpendingCondition).signature.data).toBe(
    '0118da31f542913e8c56961b87ee4794924e655a28a2034e37ef4823eeddf074747285bd6efdfbd84eecdf62cffa7c1864e683c688f4c105f4db7429066735b4e2'
  );
  expect((deserializedTx.payload as CoinbasePayloadToAltRecipient).coinbaseBytes).toEqual(
    hexToBytes('0'.repeat(64))
  );
  expect((deserializedTx.payload as CoinbasePayloadToAltRecipient).recipient).toEqual(
    contractPrincipalCV('ST2X2FYCY01Y7YR2TGC2Y6661NFF3SMH0NGXPWTV5', 'hello_world')
  );
  expect(deserializedTx.txid()).toBe(
    'bd1a9e1d60ca29fc630633170f396f5b6b85c9620bd16d63384ebc5a01a1829b'
  );
  expect(deserializedTx.version).toBe(TransactionVersion.Testnet);
});

describe(serializeTransaction.name, () => {
  const serializedTx =
    '0x8080000000040055a0a92720d20398211cd4c7663d65d018efcc1f00000000000000030000000000000000010118da31f542913e8c56961b87ee4794924e655a28a2034e37ef4823eeddf074747285bd6efdfbd84eecdf62cffa7c1864e683c688f4c105f4db7429066735b4e2010200000000050000000000000000000000000000000000000000000000000000000000000000061aba27f99e007c7f605a8305e318c1abde3cd220ac0b68656c6c6f5f776f726c64';
  const tx = deserializeTransaction(serializedTx);

  test('alias of .serialize', () => {
    expect(tx.serialize()).toEqual(serializeTransaction(tx));
  });

  test(transactionToHex.name, () => {
    expect(transactionToHex(tx)).toEqual(serializeTransaction(tx));
  });
});
