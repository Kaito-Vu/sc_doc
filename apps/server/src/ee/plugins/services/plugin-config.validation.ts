import { isIP } from 'node:net'

function isIpOrCidr(value: string): boolean {
  const [addr, prefix, ...rest] = value.trim().split('/')
  const version = isIP(addr)
  if (!version || rest.length) return false
  if (prefix === undefined) return true
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128)
}

/**
 * Minimal JSON-schema subset used by plugin-config.schema.json files:
 * per-property `required`, `type` (string/number/boolean/array/object, objects
 * validated recursively), `minimum`/`maximum` and `enum`.
 */
export function validateObject(
  value: Record<string, any>,
  schema: Record<string, any>,
  prefix: string,
): string[] {
  if (!schema.properties) return []
  return Object.entries(schema.properties).flatMap(([key, propDef]) =>
    validateConfigField(`${prefix}${key}`, propDef, value?.[key]),
  )
}

export function validateConfigField(
  key: string,
  prop: unknown,
  value: unknown,
): string[] {
  const schemaProp =
    typeof prop === 'object' && prop !== null
      ? (prop as {
          required?: boolean
          type?: string
          minimum?: number
          maximum?: number
          enum?: unknown[]
          properties?: Record<string, unknown>
          maxItems?: number
          items?: { enum?: unknown[]; maxLength?: number; format?: string }
        })
      : {}

  if (value === undefined) {
    return schemaProp.required ? [`Missing required field: ${key}`] : []
  }

  switch (schemaProp.type) {
    case 'string':
      if (typeof value !== 'string') return [`Field ${key} must be string`]
      break
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [`Field ${key} must be number`]
      }
      if (schemaProp.minimum !== undefined && value < schemaProp.minimum) {
        return [`Field ${key} must be >= ${schemaProp.minimum}`]
      }
      if (schemaProp.maximum !== undefined && value > schemaProp.maximum) {
        return [`Field ${key} must be <= ${schemaProp.maximum}`]
      }
      break
    case 'boolean':
      if (typeof value !== 'boolean') return [`Field ${key} must be boolean`]
      break
    case 'array': {
      if (!Array.isArray(value)) return [`Field ${key} must be array`]
      if (
        schemaProp.maxItems !== undefined &&
        value.length > schemaProp.maxItems
      ) {
        return [`Field ${key} must have at most ${schemaProp.maxItems} items`]
      }
      const { enum: allowed, maxLength, format } = schemaProp.items ?? {}
      const bad = value.some(
        (item) =>
          typeof item !== 'string' ||
          (maxLength !== undefined && item.length > maxLength) ||
          (allowed !== undefined && !allowed.includes(item)) ||
          (format === 'ipOrCidr' && !isIpOrCidr(item)),
      )
      return bad ? [`Field ${key} has an invalid item`] : []
    }
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [`Field ${key} must be object`]
      }
      return validateObject(
        value as Record<string, any>,
        schemaProp,
        `${key}.`,
      )
  }

  if (schemaProp.enum && !schemaProp.enum.includes(value)) {
    return [`Field ${key} must be one of: ${schemaProp.enum.join(', ')}`]
  }

  return []
}
