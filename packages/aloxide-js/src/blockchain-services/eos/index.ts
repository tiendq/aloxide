import fetch from 'node-fetch';
import { TextEncoder, TextDecoder } from 'util';
import { Api, JsonRpc } from 'eosjs';
import { JsSignatureProvider, PrivateKey } from 'eosjs/dist/eosjs-jssig';

import { BlockchainService } from '../BlockchainService';
import { ContractPath, NetworkConfig } from '../TypeDefinitions';
import { readABIFile, readWASMFile } from '../../helpers/contract-files-reader';
import { BlockchainAccount } from '../BlockchainAccount';

export class EosBlockchainService extends BlockchainService {
  client: Api;
  signatureProvider: JsSignatureProvider;

  constructor(config: NetworkConfig) {
    super(config);
    const signatureProvider = new JsSignatureProvider([]);
    const rpc = new JsonRpc(this.url(), { fetch });

    this.client = new Api({
      rpc,
      signatureProvider,
      textEncoder: new TextEncoder(),
      textDecoder: new TextDecoder(),
    });
    this.signatureProvider = signatureProvider;
  }

  async deployContract(contractPath: ContractPath, account: BlockchainAccount) {
    const { abiPath, wasmPath } = contractPath;
    const { name: accountName, privateKey: privKey } = account;

    // Add key to Signature Provider
    const priv = PrivateKey.fromString(privKey);
    const pubKey = priv.getPublicKey().toString();

    this.signatureProvider.keys.set(pubKey, priv.toElliptic());
    this.signatureProvider.availableKeys.push(pubKey);

    const abi = readABIFile(abiPath, this.client);
    const wasm = readWASMFile(wasmPath);

    const trx = await this.client.transact(
      {
        actions: [
          {
            account: 'eosio',
            name: 'setcode',
            authorization: [
              {
                actor: accountName,
                permission: 'active',
              },
            ],
            data: {
              account: accountName,
              code: wasm,
              vmtype: 0,
              vmversion: 0,
            },
          },
          {
            account: 'eosio',
            name: 'setabi',
            authorization: [
              {
                actor: accountName,
                permission: 'active',
              },
            ],
            data: {
              account: accountName,
              abi,
            },
          },
        ],
      },
      {
        blocksBehind: 3,
        expireSeconds: 30,
      },
    );

    return trx;
  }

  async getBalance(account: string, code: string, symbol: string): Promise<any> {
    if (!code || !symbol) {
      throw new Error('"Code" and "Symbol" are needed when getting balance from EOS Network');
    }

    return await this.client.rpc.get_currency_balance(code, account, symbol);
  }
}
