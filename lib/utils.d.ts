import { ECPair } from 'bitcoinjs-lib';
/**
 *  @ignore
 */
export declare const BLOCKSTACK_HANDLER = "blockstack";
/**
 * Time
 * @private
 * @ignore
 */
export declare function nextYear(): Date;
/**
 * Time
 * @private
 * @ignore
 */
export declare function nextMonth(): Date;
/**
 * Time
 * @private
 * @ignore
 */
export declare function nextHour(): Date;
/**
 * Query Strings
 * @private
 * @ignore
 */
export declare function updateQueryStringParameter(uri: string, key: string, value: string): string;
/**
 * Versioning
 * @param {string} v1 - the left half of the version inequality
 * @param {string} v2 - right half of the version inequality
 * @returns {bool} iff v1 >= v2
 * @private
 * @ignore
 */
export declare function isLaterVersion(v1: string, v2: string): boolean;
/**
 * Time
 * @private
 * @ignore
 */
export declare function hexStringToECPair(skHex: string): ECPair;
export declare function ecPairToHexString(secretKey: ECPair): string;
/**
 * Time
 * @private
 * @ignore
 */
export declare function ecPairToAddress(keyPair: ECPair): string;
/**
 * UUIDs
 * @private
 * @ignore
 */
export declare function makeUUID4(): string;
/**
 * Checks if both urls pass the same origin check & are absolute
 * @param  {[type]}  uri1 first uri to check
 * @param  {[type]}  uri2 second uri to check
 * @return {Boolean} true if they pass the same origin check
 * @private
 * @ignore
 */
export declare function isSameOriginAbsoluteUrl(uri1: string, uri2: string): boolean;
/**
 * Runtime check for the existence of the global `window` object and the
 * given API key (name) on `window`. Throws an error if either are not
 * available in the current environment.
 * @param fnDesc The function name to include in the thrown error and log.
 * @param name The name of the key on the `window` object to check for.
 * @hidden
 */
export declare function checkWindowAPI(fnDesc: string, name: string): void;
