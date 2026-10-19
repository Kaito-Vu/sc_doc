import { BadRequestException } from '@nestjs/common';
import { assertQmsTransition, canQmsTransition } from './qms-workflow';

describe('qms-workflow', () => {
  it.each([
    ['draft', 'submit', true],
    ['needs_clarification', 'submit', true],
    ['in_approval', 'submit', false],
    ['in_approval', 'review', true],
    ['approved', 'review', false],
    ['approved', 'markObsolete', true],
    ['draft', 'markObsolete', false],
    ['obsolete', 'markObsolete', false],
    [null, 'submit', false],
  ] as const)('%s + %s => %s', (status, action, expected) => {
    expect(canQmsTransition(status, action)).toBe(expected);
  });

  it('refuses with the action-specific message', () => {
    expect(() => assertQmsTransition('approved', 'submit')).toThrow(
      new BadRequestException('Page is not eligible for submission'),
    );
    expect(() => assertQmsTransition('draft', 'review')).toThrow(
      'Page is not awaiting review',
    );
    expect(() => assertQmsTransition('draft', 'markObsolete')).toThrow(
      'Only approved documents can be obsolete',
    );
  });
});
