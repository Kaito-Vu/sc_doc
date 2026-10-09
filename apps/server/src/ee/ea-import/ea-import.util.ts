import { EaPackageNode } from './types/ea-import.types';

/**
 * Stable, order-independent signature of an EA export's root packages, derived
 * from the root package `xmi:id`s. Two exports of the same EA root package
 * produce the same signature, which is used to detect a duplicate re-import.
 */
export function eaRootSignature(
  roots: Array<Pick<EaPackageNode, 'id'>>,
): string {
  return roots
    .map((root) => root.id)
    .filter((id): id is string => Boolean(id))
    .sort()
    .join('|');
}
