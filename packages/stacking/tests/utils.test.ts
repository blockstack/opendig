import { hexToBytes } from '@stacks/common';
import { decodeBtcAddress, poxAddressToTuple } from '../src/utils';

export const BTC_ADDRESS_CASES = [
  // privateKey: cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df
  // generated using `bitcoinjs-lib` and `bip-schnorr` packages, verified against `micro-btc-signer`
  {
    type: 'p2pkh',
    address: '132hGUmTRtYQFq7gHVsBCfbwFp4eNsQvBi',
    expectedHash: '164247d6f2b425ac5771423ae6c80c754f7172b0',
    expectedVersion: 0,
    expectedLength: 20,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a200b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c00000002096861736862797465730200000014164247d6f2b425ac5771423ae6c80c754f7172b00776657273696f6e020000000100127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
  {
    type: 'p2sh',
    address: '34puHau4ZYdxJrUwy3eYT6ySpwQJxx4rkS',
    expectedHash: '22662a21bb732892ac097e901eb876eec9a7fc4b',
    expectedVersion: 1,
    expectedLength: 20,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a260b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c0000000209686173686279746573020000001422662a21bb732892ac097e901eb876eec9a7fc4b0776657273696f6e020000000101127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
  {
    type: 'p2sh-p2wpkh',
    address: '3P2pbdfGvBSMuSZZFBartXTtngAzVVGm1N',
    expectedHash: 'ea198195595aa5ea4b9dd5b3d84cb0387be6ca77',
    expectedVersion: 1, // 'p2sh-p2wpkh' can't be detected
    expectedLength: 20,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a290b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c00000002096861736862797465730200000014ea198195595aa5ea4b9dd5b3d84cb0387be6ca770776657273696f6e020000000101127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
  {
    type: 'p2sh-p2wsh',
    address: '358ULjuieeSJFfKuwhL4Dk6RETiu85jKN6',
    expectedHash: '25b8d40efb9428c2a49a1a93ae92e32605347c02',
    expectedVersion: 1, // 'p2sh-p2wsh' can't be detected
    expectedLength: 20,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a450b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c0000000209686173686279746573020000001425b8d40efb9428c2a49a1a93ae92e32605347c020776657273696f6e020000000101127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
  {
    type: 'p2wpkh',
    address: 'bc1qzepy04hjksj6c4m3ggawdjqvw48hzu4sy24ghc',
    expectedHash: '164247d6f2b425ac5771423ae6c80c754f7172b0',
    expectedVersion: 4,
    expectedLength: 20,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a490b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c00000002096861736862797465730200000014164247d6f2b425ac5771423ae6c80c754f7172b00776657273696f6e020000000104127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
  {
    type: 'p2wsh',
    address: 'bc1qczxqnu5hx2zvxcqt3lmr6vjju4ysf7d649mvrzd8v7l3jez0dqzqgz0ewt',
    expectedHash: 'c08c09f2973284c3600b8ff63d3252e54904f9baa976c189a767bf19644f6804',
    expectedVersion: 5,
    expectedLength: 32,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a9c0b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c00000002096861736862797465730200000020c08c09f2973284c3600b8ff63d3252e54904f9baa976c189a767bf19644f68040776657273696f6e020000000105127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
  {
    type: 'p2tr',
    address: 'bc1p8dlmzllfah294ntwatr8j5uuvcj7yg0dete94ck2krrk0ka2c9qqwwn4dr',
    expectedHash: '3b7fb17fe9edd45acd6eeac679539c6625e221edcaf25ae2cab0c767dbaac140',
    expectedVersion: 6,
    expectedLength: 32,
    mockedResult: `0x0a0c000000041266697273742d7265776172642d6379636c650100000000000000000000000000001a9f0b6c6f636b2d706572696f64010000000000000000000000000000000208706f782d616464720c000000020968617368627974657302000000203b7fb17fe9edd45acd6eeac679539c6625e221edcaf25ae2cab0c767dbaac1400776657273696f6e020000000106127265776172642d7365742d696e64657865730b0000000201000000000000000000000000000000000100000000000000000000000000000000`,
  },
];

test.each(BTC_ADDRESS_CASES)(
  'parsing btc address $type %#',
  ({ address, expectedVersion, expectedHash, expectedLength }) => {
    const decoded = decodeBtcAddress(address);
    expect(decoded.version).toBe(expectedVersion);
    expect(decoded.data).toEqual(hexToBytes(expectedHash));
    expect(decoded.data).toHaveLength(expectedLength);

    const tuple = poxAddressToTuple(address);
    expect(tuple.data['version'].buffer).toHaveLength(1);
    expect(tuple.data['version'].buffer[0]).toBe(expectedVersion);
    expect(tuple.data['hashbytes'].buffer).toEqual(hexToBytes(expectedHash));
    expect(tuple.data['hashbytes'].buffer).toHaveLength(expectedLength);
  }
);
