import { bytesToUtf8, hexToBytes } from '@stacks/common';
import {
  Cl,
  ContractPrincipalWire,
  FungiblePostConditionWire,
  NonFungiblePostConditionWire,
  Pc,
  STXPostConditionWire,
  addressToString,
  deserializeTransaction,
} from '../src';
import { BufferCV, bufferCVFromString } from '../src/clarity';
import {
  FungibleConditionCode,
  NonFungibleConditionCode,
  PostConditionPrincipalId,
  PostConditionType,
} from '../src/constants';
import {
  conditionByteToType,
  conditionTypeToByte,
  postConditionToHex,
  postConditionToWire,
  wireToPostCondition,
} from '../src/postcondition';
import { StacksWireType, parseAssetString, parsePrincipalString } from '../src/wire';
import { serializeDeserialize } from './macros';

test('STX post condition serialization and deserialization', () => {
  const postConditionType = PostConditionType.STX;

  const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

  const conditionCode = FungibleConditionCode.GreaterEqual;
  const amount = 1000000;

  const postCondition = postConditionToWire({
    type: 'stx-postcondition',
    address,
    condition: 'gte',
    amount,
  });

  const deserialized = serializeDeserialize(
    postCondition,
    StacksWireType.PostCondition
  ) as STXPostConditionWire;
  expect(deserialized.conditionType).toBe(postConditionType);
  expect(deserialized.principal.prefix).toBe(PostConditionPrincipalId.Standard);
  if (!('address' in deserialized.principal)) throw TypeError;
  expect(addressToString(deserialized.principal.address)).toBe(address);
  expect(deserialized.conditionCode).toBe(conditionCode);
  expect(deserialized.amount.toString()).toBe(amount.toString());
});

test('Fungible post condition serialization and deserialization', () => {
  const postConditionType = PostConditionType.Fungible;

  const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

  const conditionCode = FungibleConditionCode.GreaterEqual;
  const amount = 1000000;

  const assetAddress = 'SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21';
  const assetContractName = 'contract_name';
  const assetName = 'asset_name';

  const postCondition = postConditionToWire({
    type: 'ft-postcondition',
    address,
    condition: 'gte',
    amount,
    asset: `${assetAddress}.${assetContractName}::${assetName}`,
  });

  const deserialized = serializeDeserialize(
    postCondition,
    StacksWireType.PostCondition
  ) as FungiblePostConditionWire;
  expect(deserialized.conditionType).toBe(postConditionType);
  expect(deserialized.principal.prefix).toBe(PostConditionPrincipalId.Standard);
  if (!('address' in deserialized.principal)) throw TypeError;
  expect(addressToString(deserialized.principal.address)).toBe(address);
  expect(deserialized.conditionCode).toBe(conditionCode);
  expect(deserialized.amount.toString()).toBe(amount.toString());
  expect(addressToString(deserialized.asset.address)).toBe(assetAddress);
  expect(deserialized.asset.contractName.content).toBe(assetContractName);
  expect(deserialized.asset.assetName.content).toBe(assetName);
});

test('Non-fungible post condition serialization and deserialization', () => {
  const postConditionType = PostConditionType.NonFungible;

  const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
  const contractName = 'contract-name';

  const conditionCode = NonFungibleConditionCode.DoesNotSend;

  const assetAddress = 'SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21';
  const assetContractName = 'contract_name';
  const assetName = 'asset_name';

  const nftAssetName = 'nft_asset_name';

  const postCondition = postConditionToWire({
    type: 'nft-postcondition',
    address: `${address}.${contractName}`,
    condition: 'not-sent',
    asset: `${assetAddress}.${assetContractName}::${assetName}`,
    assetId: bufferCVFromString(nftAssetName),
  });

  const deserialized = serializeDeserialize(
    postCondition,
    StacksWireType.PostCondition
  ) as NonFungiblePostConditionWire;
  expect(deserialized.conditionType).toBe(postConditionType);
  expect(deserialized.principal.prefix).toBe(PostConditionPrincipalId.Contract);
  if (!('address' in deserialized.principal)) throw TypeError;
  expect(addressToString(deserialized.principal.address)).toBe(address);
  expect((deserialized.principal as ContractPrincipalWire).contractName.content).toBe(contractName);
  expect(deserialized.conditionCode).toBe(conditionCode);
  expect(addressToString(deserialized.asset.address)).toBe(assetAddress);
  expect(deserialized.asset.contractName.content).toBe(assetContractName);
  expect(deserialized.asset.assetName.content).toBe(assetName);
  expect(bytesToUtf8(hexToBytes((deserialized.assetName as BufferCV).value))).toEqual(nftAssetName);
});

test('Non-fungible post condition with string IDs serialization and deserialization', () => {
  const postConditionType = PostConditionType.NonFungible;

  const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
  const contractName = 'contract-name';

  const conditionCode = NonFungibleConditionCode.DoesNotSend;

  const assetAddress = 'SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21';
  const assetContractName = 'contract_name';
  const assetName = 'asset_name';

  const nftAssetName = 'nft_asset_name';

  const postCondition = postConditionToWire({
    type: 'nft-postcondition',
    address: `${address}.${contractName}`,
    condition: 'not-sent',
    asset: `${assetAddress}.${assetContractName}::${assetName}`,
    assetId: bufferCVFromString(nftAssetName),
  });

  const deserialized = serializeDeserialize(
    postCondition,
    StacksWireType.PostCondition
  ) as NonFungiblePostConditionWire;
  expect(deserialized.conditionType).toBe(postConditionType);
  expect(deserialized.principal.prefix).toBe(PostConditionPrincipalId.Contract);
  if (!('address' in deserialized.principal)) throw TypeError;
  expect(addressToString(deserialized.principal.address)).toBe(address);
  expect((deserialized.principal as ContractPrincipalWire).contractName.content).toBe(contractName);
  expect(deserialized.conditionCode).toBe(conditionCode);
  expect(addressToString(deserialized.asset.address)).toBe(assetAddress);
  expect(deserialized.asset.contractName.content).toBe(assetContractName);
  expect(deserialized.asset.assetName.content).toBe(assetName);
  expect(bytesToUtf8(hexToBytes((deserialized.assetName as BufferCV).value))).toEqual(nftAssetName);
});

describe(postConditionToHex.name, () => {
  const TEST_CASES = [
    {
      repr: {
        type: 'stx-postcondition',
        address: 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6',
        condition: 'eq',
        amount: 100_000,
      } as const,
      expected: '00021a164247d6f2b425ac5771423ae6c80c754f7172b00100000000000186a0',
    },
    {
      repr: {
        type: 'ft-postcondition',
        address: 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6.other',
        condition: 'eq',
        amount: 100_000,
        asset: 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6.token::tok',
      } as const,
      expected:
        '01031a164247d6f2b425ac5771423ae6c80c754f7172b0056f746865721a164247d6f2b425ac5771423ae6c80c754f7172b005746f6b656e03746f6b0100000000000186a0',
    },
    {
      repr: {
        type: 'nft-postcondition',
        address: 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6',
        condition: 'not-sent',
        asset: 'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6.token::tok',
        assetId: Cl.uint(32),
      } as const,
      expected:
        '02021a164247d6f2b425ac5771423ae6c80c754f7172b01a164247d6f2b425ac5771423ae6c80c754f7172b005746f6b656e03746f6b010000000000000000000000000000002011',
    },
  ];

  test.each(TEST_CASES)('postConditionToHex %p', ({ repr, expected }) => {
    const hex = postConditionToHex(repr);
    expect(hex).toBe(expected);
  });
});

describe('origin postcondition', () => {
  test('origin postcondition to wire', () => {
    const pc = {
      type: 'stx-postcondition',
      address: 'origin',
      condition: 'eq',
      amount: '10000',
    } as const;
    const wire = postConditionToWire(pc);
    expect(wire.conditionType).toBe(PostConditionType.STX);
    expect(wire.principal.prefix).toBe(PostConditionPrincipalId.Origin);
  });

  test('deserialize test vector from stacks-core', () => {
    // this same hex, deserialized in the stacks rust lib:
    // StacksTransaction { version: Testnet, chain_id: 2147483648, auth: Standard(Singlesig(SinglesigSpendingCondition { hash_mode: P2PKH, signer: a5180cc1ff6050df53f0ab766d76b630e14feb0c, nonce: 7, tx_fee: 2059, key_encoding: Compressed, signature: 0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 })), anchor_mode: Any, post_condition_mode: Deny, post_conditions: [STX(Origin, SentGe, 1)], payload: ContractCall(TransactionContractCall { address: StacksAddress { version: 26, bytes: 0000000000000000000000000000000000000000 }, contract_name: ContractName("bns"), function_name: ClarityName("name-preorder"), function_args: [Sequence(Buffer(2931e7d082bd215fff3d447d8e2adc7c88d7e207)), UInt(10)] }) }
    const txHex =
      '0x80800000000400a5180cc1ff6050df53f0ab766d76b630e14feb0c0000000000000007000000000000080b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000302000000010001030000000000000001021a000000000000000000000000000000000000000003626e730d6e616d652d7072656f726465720000000202000000142931e7d082bd215fff3d447d8e2adc7c88d7e207010000000000000000000000000000000a';

    expect(() => {
      const tx = deserializeTransaction(txHex);
      const pc = tx.postConditions.values[0];
      expect(pc.principal.prefix).toBe(PostConditionPrincipalId.Origin);
    }).not.toThrow();
  });
});

describe('wireToPostCondition', () => {
  const TEST_CASES = [
    {
      name: 'STX post condition',
      postConditionWire: {
        type: StacksWireType.PostCondition,
        conditionType: PostConditionType.STX,
        principal: parsePrincipalString('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
        conditionCode: FungibleConditionCode.GreaterEqual,
        amount: 1000000n,
      },
      expected: Pc.principal('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')
        .willSendGte(1000000n)
        .ustx(),
    },
    {
      name: 'STX post condition with origin',
      postConditionWire: {
        type: StacksWireType.PostCondition,
        conditionType: PostConditionType.STX,
        principal: { type: StacksWireType.Principal, prefix: PostConditionPrincipalId.Origin },
        conditionCode: FungibleConditionCode.Equal,
        amount: 2000000n,
      },
      expected: Pc.origin().willSendEq(2000000n).ustx(),
    },
    {
      name: 'Fungible post condition',
      postConditionWire: {
        type: StacksWireType.PostCondition,
        conditionType: PostConditionType.Fungible,
        principal: parsePrincipalString('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
        conditionCode: FungibleConditionCode.GreaterEqual,
        amount: 1000000n,
        asset: parseAssetString(
          'SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21.contract_name::asset_name'
        ),
      },
      expected: Pc.principal('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')
        .willSendGte(1000000n)
        .ft('SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21.contract_name', 'asset_name'),
    },
    {
      name: 'Non-fungible post condition',
      postConditionWire: {
        type: StacksWireType.PostCondition,
        conditionType: PostConditionType.NonFungible,
        principal: parsePrincipalString('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B.contract-name'),
        conditionCode: NonFungibleConditionCode.DoesNotSend,
        asset: parseAssetString(
          'SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21.contract_name::asset_name'
        ),
        assetName: bufferCVFromString('nft_asset_name'),
      },
      expected: Pc.principal('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B.contract-name')
        .willNotSendAsset()
        .nft(
          'SP2ZP4GJDZJ1FDHTQ963F0292PE9J9752TZJ68F21.contract_name',
          'asset_name',
          bufferCVFromString('nft_asset_name')
        ),
    },
  ] as const;

  test.each(TEST_CASES)('$name', ({ postConditionWire, expected }) => {
    const postCondition = wireToPostCondition(postConditionWire);
    expect(postCondition).toEqual(expected);

    const roundTrip = postConditionToWire(postCondition);
    expect(roundTrip).toEqual(postConditionWire);
  });
});

describe('conditionTypeToByte', () => {
  const fungibleTestCases = [
    { name: 'eq', expectedCode: FungibleConditionCode.Equal },
    { name: 'gt', expectedCode: FungibleConditionCode.Greater },
    { name: 'lt', expectedCode: FungibleConditionCode.Less },
    { name: 'gte', expectedCode: FungibleConditionCode.GreaterEqual },
    { name: 'lte', expectedCode: FungibleConditionCode.LessEqual },
  ] as const;

  const nonFungibleTestCases = [
    { name: 'sent', expectedCode: NonFungibleConditionCode.Sends },
    { name: 'not-sent', expectedCode: NonFungibleConditionCode.DoesNotSend },
  ] as const;

  test.each(fungibleTestCases)(
    'converts fungible condition $name to byte code',
    ({ name, expectedCode }) => {
      const result = conditionTypeToByte(name);
      expect(result).toBe(expectedCode);
    }
  );

  test.each(nonFungibleTestCases)(
    'converts non-fungible condition $name to byte code',
    ({ name, expectedCode }) => {
      const result = conditionTypeToByte(name);
      expect(result).toBe(expectedCode);
    }
  );
});

describe('conditionBytesToType', () => {
  const fungibleTestCases = [
    { code: FungibleConditionCode.Equal, expectedName: 'eq' },
    { code: FungibleConditionCode.Greater, expectedName: 'gt' },
    { code: FungibleConditionCode.Less, expectedName: 'lt' },
    { code: FungibleConditionCode.GreaterEqual, expectedName: 'gte' },
    { code: FungibleConditionCode.LessEqual, expectedName: 'lte' },
  ] as const;

  const nonFungibleTestCases = [
    { code: NonFungibleConditionCode.Sends, expectedName: 'sent' },
    { code: NonFungibleConditionCode.DoesNotSend, expectedName: 'not-sent' },
  ] as const;

  test.each(fungibleTestCases)(
    'converts fungible condition code $code to name',
    ({ code, expectedName }) => {
      const result = conditionByteToType(code);
      expect(result).toBe(expectedName);
    }
  );

  test.each(nonFungibleTestCases)(
    'converts non-fungible condition code $code to name',
    ({ code, expectedName }) => {
      const result = conditionByteToType(code);
      expect(result).toBe(expectedName);
    }
  );
});
