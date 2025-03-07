// packages/cli/tests/direct-function-args.test.ts

import { testables } from '../src/cli';
import { CLINetworkAdapter, CLI_NETWORK_OPTS, getNetwork } from '../src/network';
import { CLI_CONFIG_TYPE } from '../src/argparse';
import { ClarityAbi } from '@stacks/transactions';
import { readFileSync } from 'fs';
import inquirer from 'inquirer';
import fetchMock from 'jest-fetch-mock';
import path from 'path';
import {
  makeContractCall,
  uintCV,
  falseCV,
  standardPrincipalCV,
  PostConditionMode,
} from '@stacks/transactions';
import { STACKS_TESTNET } from '@stacks/network';

const { contractFunctionCall } = testables as any;

// Import the real ABI file that contains all the test functions
const TEST_ABI: ClarityAbi = JSON.parse(
  readFileSync(path.join(__dirname, './abi/test-abi.json')).toString()
);

// jest.mock('inquirer');
fetchMock.enableMocks();

const testnetNetwork = new CLINetworkAdapter(
  getNetwork({} as CLI_CONFIG_TYPE, true),
  {} as CLI_NETWORK_OPTS
);

describe('Contract Function Call with Direct Arguments', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test('Should fall back to interactive prompts when no direct arguments provided', async () => {
    const contractAddress = 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6';
    const contractName = 'test-contract-name';
    const functionName = 'test-func-primitive-argument';
    const fee = '230';
    const nonce = '3';
    const privateKey = 'cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df01';
    const args = [contractAddress, contractName, functionName, fee, nonce, privateKey];

    const contractInputArg = {
      amount: '1000',
      address: 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6',
      exists: 'false',
    };

    // Mock the inquirer prompt to return our test values
    // @ts-ignore
    inquirer.prompt = jest.fn().mockResolvedValue(contractInputArg);

    fetchMock.mockResponseOnce(JSON.stringify(TEST_ABI), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    fetchMock.mockResponseOnce(
      JSON.stringify({
        txid: '0x94b1cfab79555b8c6725f19e4fcd6268934d905578a3e8ef7a1e542b931d3676',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    // Create the expected transaction that should match what contractFunctionCall builds
    const functionArgs = [
      uintCV(1000),
      standardPrincipalCV('STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6'),
      falseCV(),
    ];

    const expectedTx = await makeContractCall({
      contractAddress,
      contractName,
      functionName,
      functionArgs,
      senderKey: privateKey,
      fee: BigInt(fee),
      nonce: BigInt(nonce),
      network: STACKS_TESTNET,
      postConditionMode: PostConditionMode.Allow,
    });

    const expectedTxHex = expectedTx.serialize();

    await contractFunctionCall(testnetNetwork, args);

    // Verify interactive prompts were used
    expect(inquirer.prompt).toHaveBeenCalled();

    // Verify fetch was called with the expected URLs
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call should be to fetch the ABI
    const abiCallUrl = fetchMock.mock.calls[0][0];
    const abiCallUrlString = abiCallUrl instanceof Request ? abiCallUrl.url : String(abiCallUrl);
    expect(abiCallUrlString).toContain('/v2/contracts/interface/');
    expect(abiCallUrlString).toContain(contractAddress);
    expect(abiCallUrlString).toContain(contractName);

    // Second call should be to broadcast the transaction
    const txCallUrl = fetchMock.mock.calls[1][0];
    const txCallUrlString = txCallUrl instanceof Request ? txCallUrl.url : String(txCallUrl);
    expect(txCallUrlString).toContain('/v2/transactions');

    // Extract the transaction from the second fetch call
    const broadcastRequest = fetchMock.mock.calls[1][1] as RequestInit;
    // TypeScript safety: ensure body exists and convert to string if needed
    const bodyString = broadcastRequest?.body
      ? typeof broadcastRequest.body === 'string'
        ? broadcastRequest.body
        : String(broadcastRequest.body)
      : '{}';

    const requestBody = JSON.parse(bodyString);
    const capturedTxHex = requestBody.tx;

    // Validate the transaction
    expect(capturedTxHex).toBeTruthy();
    expect(typeof capturedTxHex).toBe('string');
    expect(capturedTxHex.length).toBeGreaterThan(100); // Reasonable transaction length

    // Compare the captured transaction hex with our expected transaction
    expect(capturedTxHex).toEqual(expectedTxHex);
  });
});
