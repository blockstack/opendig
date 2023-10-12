import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import * as btc from '@scure/btc-signer';
import { TransactionVersion } from '@stacks/transactions';
import {
  DerivationType,
  deriveAccount,
  generateWallet,
  getRootNode,
  getStxAddress,
} from '@stacks/wallet-sdk';

import RpcClient from '@btc-helpers/rpc';
import { RpcCallSpec } from '@btc-helpers/rpc/dist/callspec';
import { bytesToHex } from '@stacks/common';
import { BufferCV, Cl, ClarityValue, SomeCV, UIntCV, serializeCV } from '@stacks/transactions';
import { BitcoinNetwork, REGTEST, TESTNET } from './constants';
import { wrapLazyProxy } from './utils';

/** todo */
// https://blockstream.info/api/address/1KFHE7w8BhaENAswwryaoccDb6qcT6DbYY/utxo
// [{"txid":"033e44b535c5709d30234921608219ee5ca1e320fa9def44715eaeb2b7ad52d3","vout":0,"status":{"confirmed":false},"value":42200}]
export type BlockstreamUtxo = {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height: number;
  };
};

/** todo */
export type UtxoWithTx = BlockstreamUtxo & {
  tx: string | Promise<string>;
};

export type SpendableUtxo = BlockstreamUtxo & {
  input: btc.TransactionInput | Promise<btc.TransactionInput>;
  vsize?: number | Promise<number>;
};

/** todo */
export type BlockstreamFeeEstimates =
  // prettier-ignore
  { [K in | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23' | '24' | '25' | '144' | '504' | '1008']: number; };

export interface UrlConfig {
  bitcoinCoreRpcUrl: string;
  bitcoinElectrumApiUrl: string;
  mempoolExplorerUrl: string;
  stacksApiUrl: string;
  sbtcBridgeApiUrl: string;
}

export class TestnetHelper {
  config: Omit<Omit<UrlConfig, 'mempoolExplorerUrl'>, 'bitcoinCoreRpcUrl'>;

  constructor(config?: Partial<UrlConfig>) {
    this.config = Object.assign(
      {
        bitcoinElectrumApiUrl: 'https://blockstream.info/testnet/api',
        stacksApiUrl: 'https://stacks-node-api.testnet.stacks.co',
        sbtcBridgeApiUrl: 'http://127.0.0.1:3010', // todo
      },
      config
    );
  }

  async fetchUtxos(address: string): Promise<UtxoWithTx[]> {
    // todo: error handling?
    return fetch(`${this.config.bitcoinElectrumApiUrl}/address/${address}/utxo`)
      .then(res => res.json())
      .then((utxos: BlockstreamUtxo[]) =>
        utxos.sort((a, b) => a.status.block_height - b.status.block_height)
      )
      .then((utxos: BlockstreamUtxo[]) =>
        utxos.map(u => wrapLazyProxy(u, 'tx', () => this.fetchTxHex(u.txid)))
      );
  }

  async fetchTxHex(txid: string): Promise<string> {
    // todo: error handling?
    return fetch(`${this.config.bitcoinElectrumApiUrl}/tx/${txid}/hex`).then(res => res.text());
  }

  async estimateFeeRates(): Promise<BlockstreamFeeEstimates> {
    return fetch(`${this.config.bitcoinElectrumApiUrl}/fee-estimates`).then(res => res.json());
  }

  async estimateFeeRate(target: 'low' | 'medium' | 'high' | number): Promise<number> {
    const feeEstimates = await this.estimateFeeRates();
    const t =
      typeof target === 'number'
        ? target.toString()
        : target === 'high'
        ? '1'
        : target === 'medium'
        ? '2'
        : '3';
    if (t in feeEstimates) {
      return feeEstimates[t as keyof BlockstreamFeeEstimates];
    }

    throw new Error(`Invalid fee target: ${target}`);
  }

  async broadcastTx(tx: btc.Transaction): Promise<string> {
    return await fetch(`${this.config.bitcoinElectrumApiUrl}/tx`, {
      method: 'POST',
      body: tx.hex,
    }).then(res => res.text());
  }

  async stacksCallReadOnly({
    contractAddress,
    functionName,
    sender = 'ST000000000000000000002AMW42H',
    args = [],
  }: {
    contractAddress: string;
    functionName: string;
    sender?: string;
    args?: string[];
  }) {
    contractAddress = contractAddress.replace('.', '/');
    return await fetch(
      // todo abstract url
      `https://api.testnet.hiro.so/v2/contracts/call-read/${contractAddress}/${encodeURIComponent(
        functionName
      )}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sender, arguments: args }),
      }
    )
      .then(res => res.json())
      .then(res => Cl.deserialize(res.result));
  }

  async getBitcoinAccount(mnemonic: string, idx: number = 0) {
    return await getBitcoinAccount(TESTNET, mnemonic, idx);
  }

  async getStacksAccount(mnemonic: string, idx: number = 0) {
    return await getStacksAccount(TransactionVersion.Testnet, mnemonic, idx);
  }
}

// todo: rename to helper, and add wallets etc.
export class DevEnvHelper {
  config: UrlConfig;
  btcRpc: RpcClient & RpcCallSpec;

  constructor(config?: Partial<UrlConfig>) {
    this.config = Object.assign(
      {
        bitcoinCoreRpcUrl: 'http://devnet:devnet@127.0.0.1:18433',
        bitcoinElectrumApiUrl: 'http://127.0.0.1:3002',
        mempoolExplorerUrl: 'http://127.0.0.1:8083',
        stacksApiUrl: 'http://127.0.0.1:3999',
        sbtcBridgeApiUrl: 'http://127.0.0.1:3010',
      },
      config
    );

    this.btcRpc = new RpcClient(this.config.bitcoinCoreRpcUrl).Typed;
  }

  /**
   * Fetches utxos for a given address.
   * If no utxos are found, imports the address, rescans, and tries again.
   * @param address address or script hash of wallet to fetch utxos for
   */
  async fetchUtxos(address: string): Promise<UtxoWithTx[]> {
    // todo: error handling?
    return fetch(`${this.config.bitcoinElectrumApiUrl}/address/${address}/utxo`)
      .then(res => res.json())
      .then((utxos: BlockstreamUtxo[]) =>
        utxos.sort((a, b) => a.status.block_height - b.status.block_height)
      )
      .then((utxos: BlockstreamUtxo[]) =>
        utxos.map(u => wrapLazyProxy(u, 'tx', () => this.fetchTxHex(u.txid)))
      );
  }

  async fetchTxHex(txid: string): Promise<string> {
    // todo: error handling?
    return fetch(`${this.config.mempoolExplorerUrl}/api/tx/${txid}/hex`).then(res => res.text());
  }

  /**
   */
  async getBalance(address: string): Promise<number> {
    const addressInfo = await fetch(
      `${this.config.mempoolExplorerUrl}/api/address/${address}`
    ).then(r => r.json());

    return addressInfo.chain_stats.funded_txo_sum - addressInfo.chain_stats.spent_txo_sum;
  }

  // Fake impl for devenv
  // eslint-disable-next-line @typescript-eslint/require-await
  async estimateFeeRate(target: 'low' | 'medium' | 'high' | number = 'medium'): Promise<number> {
    switch (target) {
      case 'high':
        return 1.4;
      case 'medium':
        return 1.2;
      case 'low':
        return 1;
      default:
        return target;
    }
  }

  async broadcastTx(tx: btc.Transaction): Promise<string> {
    return await fetch(`${this.config.bitcoinElectrumApiUrl}/tx`, {
      method: 'POST',
      body: tx.hex,
    }).then(res => res.text());
  }

  // todo abstract for both testnet and devenv classes
  async stacksCallReadOnly({
    contractAddress,
    functionName,
    sender = 'ST000000000000000000002AMW42H',
    args = [],
  }: {
    contractAddress: string;
    functionName: string;
    sender?: string;
    args?: ClarityValue[];
  }) {
    contractAddress = contractAddress.replace('.', '/');

    const argsSerialized = args.map(serializeCV).map(bytesToHex);

    return await fetch(
      `${this.config.stacksApiUrl}/v2/contracts/call-read/${contractAddress}/${encodeURIComponent(
        functionName
      )}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sender, arguments: argsSerialized }),
      }
    )
      .then(res => {
        return res.json();
      })
      .then(res => {
        return Cl.deserialize(res.result);
      });
  }

  async getSbtcPegAddress(contractAddress: string): Promise<string> {
    const publicKey = (
      (await this.stacksCallReadOnly({
        contractAddress,
        functionName: 'get-bitcoin-wallet-public-key',
      })) as SomeCV<BufferCV>
    ).value.buffer;

    return btc.Address(REGTEST).encode({
      type: 'tr',
      // strip y byte
      pubkey: publicKey.length === 33 ? publicKey.subarray(1) : publicKey,
    });
  }

  async getSbtcBalance({
    holderAddress,
    sbtcContract,
  }: {
    holderAddress: string;
    sbtcContract: string;
  }) {
    const [address, name] = holderAddress.split('.');

    const balance = (await this.stacksCallReadOnly({
      contractAddress: sbtcContract,
      functionName: 'get-balance',
      args: [name ? Cl.contractPrincipal(address, name) : Cl.standardPrincipal(address)],
    })) as SomeCV<UIntCV>;

    return balance?.value?.value ?? 0;
  }

  async getBitcoinAccount(mnemonic: string, idx: number = 0) {
    return await getBitcoinAccount(REGTEST, mnemonic, idx);
  }

  async getStacksAccount(mnemonic: string, idx: number = 0) {
    return await getStacksAccount(TransactionVersion.Testnet, mnemonic, idx);
  }
}

// == WALLET ===================================================================

export const WALLET_00 =
  'twice kind fence tip hidden tilt action fragile skin nothing glory cousin green tomorrow spring wrist shed math olympic multiply hip blue scout claw';
export const WALLET_01 =
  'sell invite acquire kitten bamboo drastic jelly vivid peace spawn twice guilt pave pen trash pretty park cube fragile unaware remain midnight betray rebuild';
export const WALLET_02 =
  'hold excess usual excess ring elephant install account glad dry fragile donkey gaze humble truck breeze nation gasp vacuum limb head keep delay hospital';

export async function getBitcoinAccount(
  network: BitcoinNetwork,
  mnemonic: string,
  idx: number = 0
) {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed, network.bip32);

  const path = `m/84'/${network.bip84.coin}'/${idx}'/0/0`;
  const privateKey = hdkey.derive(path).privateKey!;
  const publicKey = hdkey.derive(path).publicKey!;

  const trPath = `m/86'/${network.bip84.coin}'/${idx}'/0/0`;
  const trPrivateKey = hdkey.derive(trPath).privateKey!;
  const trPublicKey = hdkey.derive(trPath).publicKey!; // not sure if this should be used, but this is what the CLI returns

  return {
    privateKey,
    publicKey,
    wpkh: { address: btc.getAddress('wpkh', privateKey, network)! },
    tr: {
      address: btc.getAddress('tr', trPrivateKey, network)!,
      publicKey: trPublicKey,
    },
  };
}

export async function getStacksAccount(
  transactionVersion: TransactionVersion,
  mnemonic: string,
  idx: number = 0
) {
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: '',
  });

  const account = deriveAccount({
    rootNode: getRootNode(wallet),
    index: idx,
    salt: wallet.salt,
    stxDerivationType: DerivationType.Wallet,
  });

  return {
    ...account,
    address: getStxAddress({ account, transactionVersion }),
  };
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
