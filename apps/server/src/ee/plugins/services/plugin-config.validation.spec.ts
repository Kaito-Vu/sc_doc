import { validateConfigField as f, validateObject } from './plugin-config.validation'

describe('validateConfigField', () => {
  it('missing/required', () => {
    expect(f('k', { required: true }, undefined)).toEqual(['Missing required field: k'])
    expect(f('k', {}, undefined)).toEqual([])
    expect(f('k', 'bad', 'x')).toEqual([])
  })
  it('string/boolean', () => {
    expect(f('k', { type: 'string' }, 1)).toEqual(['Field k must be string'])
    expect(f('k', { type: 'string' }, 'a')).toEqual([])
    expect(f('k', { type: 'boolean' }, 'a')).toEqual(['Field k must be boolean'])
    expect(f('k', { type: 'boolean' }, false)).toEqual([])
  })
  it('number', () => {
    const p = { type: 'number', minimum: 1, maximum: 3 }
    expect(f('k', p, '1')).toEqual(['Field k must be number'])
    expect(f('k', p, NaN)).toEqual(['Field k must be number'])
    expect(f('k', p, 0)).toEqual(['Field k must be >= 1'])
    expect(f('k', p, 4)).toEqual(['Field k must be <= 3'])
    expect(f('k', p, 2)).toEqual([])
  })
  it('array', () => {
    expect(f('k', { type: 'array' }, 'a')).toEqual(['Field k must be array'])
    expect(f('k', { type: 'array', maxItems: 1 }, ['a', 'b'])).toEqual([
      'Field k must have at most 1 items',
    ])
    const bad = ['Field k has an invalid item']
    expect(f('k', { type: 'array' }, [1])).toEqual(bad)
    expect(f('k', { type: 'array', items: { maxLength: 2 } }, ['abc'])).toEqual(bad)
    expect(f('k', { type: 'array', items: { enum: ['a'] } }, ['b'])).toEqual(bad)
    expect(f('k', { type: 'array', items: { enum: ['a'] } }, ['a'])).toEqual([])
    const ip = { type: 'array', items: { format: 'ipOrCidr' } }
    expect(f('k', ip, ['10.0.0.0/8', '::1', '1.2.3.4'])).toEqual([])
    expect(f('k', ip, ['10.0.0.0/33'])).toEqual(bad)
    expect(f('k', ip, ['nope'])).toEqual(bad)
    expect(f('k', ip, ['1.2.3.4/1/2'])).toEqual(bad)
  })
  it('object + nested', () => {
    expect(f('k', { type: 'object' }, [])).toEqual(['Field k must be object'])
    expect(f('k', { type: 'object' }, null)).toEqual(['Field k must be object'])
    const p = { type: 'object', properties: { a: { type: 'number', required: true } } }
    expect(f('k', p, {})).toEqual(['Missing required field: k.a'])
    expect(f('k', p, { a: 'x' })).toEqual(['Field k.a must be number'])
    expect(f('k', p, { a: 1 })).toEqual([])
  })
  it('enum and unknown type', () => {
    expect(f('k', { enum: ['a', 'b'] }, 'c')).toEqual(['Field k must be one of: a, b'])
    expect(f('k', { type: 'string', enum: ['a'] }, 'a')).toEqual([])
    expect(f('k', { type: 'weird' }, 5)).toEqual([])
  })
})

describe('validateObject', () => {
  it('no properties -> []; prefix applied', () => {
    expect(validateObject({}, {}, '')).toEqual([])
    expect(
      validateObject({}, { properties: { a: { required: true } } }, 'p.'),
    ).toEqual(['Missing required field: p.a'])
  })
})
