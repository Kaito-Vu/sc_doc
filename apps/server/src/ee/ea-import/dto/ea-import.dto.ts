/**
 * Thin DTO for the EA XMI multipart import endpoint.
 *
 * The upload is a multipart/form-data request whose only non-file field is
 * `spaceId` (a uuid). The file itself is read through `@fastify/multipart`, so
 * this type only documents the expected field shape.
 */
export interface EaImportFields {
  spaceId: string;
}

export class EaImportDto {
  spaceId: string;
}
