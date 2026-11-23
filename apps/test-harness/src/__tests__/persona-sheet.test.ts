import { describe, expect, it } from 'vitest';
import {
  isImportable,
  parseContinuityCues,
  parsePersonaCsv,
  parsePersonaSheet,
  personaMetaFromRow,
  seedTurnsFromRow,
} from '../lib/persona-sheet';

const HEADER =
  'personaId,personaVersion,expectedBehavior,demographics,profile,trajectory,goals,secrets,openerStyle,sampleStarters,continuityCues,determinismRules,tags';

describe('parsePersonaSheet', () => {
  it('parses a full row into the character sheet the simulator reads', () => {
    const csv = [
      HEADER,
      'grief-job-loss-01,1,"reflect_and_explore, avoid_directive_advice",34 F Pune designer,"Lost her job in September; sleeps badly","de-escalating","make sense of the last two months; stop blaming herself","was let go for raising a safety issue; cried at her desk","one line, apologetic","i lost my job in september; i keep waking up at 4","stable: was let go in september | temporary: exam week at home","types in lower case; rarely uses punctuation","grief;work"',
    ].join('\n');

    const { rows, headerWarnings } = parsePersonaCsv(csv);
    expect(headerWarnings).toEqual([]);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.personaId).toBe('grief-job-loss-01');
    expect(row.personaVersion).toBe('1');
    expect(row.expectedBehavior).toBe('reflect_and_explore, avoid_directive_advice');
    expect(row.trajectory).toBe('de-escalating');
    expect(row.goals).toEqual(['make sense of the last two months', 'stop blaming herself']);
    expect(row.secrets).toEqual(['was let go for raising a safety issue', 'cried at her desk']);
    expect(row.sampleStarters).toEqual(['i lost my job in september', 'i keep waking up at 4']);
    expect(row.continuityCues).toEqual({
      stable: ['was let go in september'],
      temporary: ['exam week at home'],
    });
    expect(row.determinismRules).toEqual(['types in lower case', 'rarely uses punctuation']);
    expect(row.tags).toEqual(['grief', 'work']);
    expect(row.errors).toEqual([]);
    expect(row.warnings).toEqual([]);
    expect(isImportable(row)).toBe(true);
  });

  it('accepts human header spellings and skips a leading blank row', () => {
    const rows = parsePersonaSheet([
      ['', ''],
      ['Persona ID', 'Version', 'Expected Behavior', 'Profile'],
      ['insomnia-01', '2', 'reflect_and_explore', 'awake until 3am most nights'],
    ]);

    expect(rows.headerWarnings.filter((warning) => warning.includes('Ignored'))).toEqual([]);
    expect(rows.rows[0].personaId).toBe('insomnia-01');
    expect(rows.rows[0].personaVersion).toBe('2');
    expect(rows.rows[0].expectedBehavior).toBe('reflect_and_explore');
  });

  it('rejects a row with no personaId and says so', () => {
    const { rows } = parsePersonaCsv([HEADER, ',1,reflect_and_explore,,a profile'].join('\n'));
    expect(rows[0].errors).toContain('personaId is required (or a name column to derive one from)');
    expect(isImportable(rows[0])).toBe(false);
  });

  it('warns rather than rejects when the rubric is missing — the persona is runnable but ungraded', () => {
    const { rows } = parsePersonaCsv([HEADER, 'no-rubric-01,1,,40 M Chennai teacher,"quiet for weeks",stable,,'].join('\n'));
    expect(rows[0].errors).toEqual([]);
    expect(isImportable(rows[0])).toBe(true);
    expect(rows[0].warnings.join(' ')).toContain('UNGRADED');
  });

  it('defaults a missing version to 1 with a warning', () => {
    const { rows } = parsePersonaCsv([HEADER, 'no-version-01,,reflect_and_explore,,profile'].join('\n'));
    expect(rows[0].personaVersion).toBe('1');
    expect(rows[0].warnings.join(' ')).toContain('personaVersion');
  });

  it('rejects an unknown trajectory instead of silently defaulting it', () => {
    const { rows } = parsePersonaCsv([HEADER, 'bad-arc-01,1,reflect_and_explore,,profile,wobbly'].join('\n'));
    expect(rows[0].errors.join(' ')).toContain('invalid trajectory');
  });

  it('rejects a duplicate personaId inside one sheet', () => {
    const { rows } = parsePersonaCsv(
      [HEADER, 'dup-01,1,reflect_and_explore,,profile', 'dup-01,1,reflect_and_explore,,profile'].join('\n'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].errors.join(' ')).toContain('duplicate personaId');
  });

  it('warns about unrecognised columns instead of dropping them silently', () => {
    const { headerWarnings } = parsePersonaCsv(
      ['personaId,personaVersion,expectedBehavior,mood', 'x-01,1,reflect_and_explore,low'].join('\n'),
    );
    expect(headerWarnings.join(' ')).toContain('mood');
  });
});

describe('parseContinuityCues', () => {
  it('accepts a plain list', () => {
    expect(parseContinuityCues('night shifts; two kids')).toEqual(['night shifts', 'two kids']);
  });

  it('splits a stable/temporary pair, which is what makes C4 testable', () => {
    expect(parseContinuityCues('stable: night shifts | temporary: exam week')).toEqual({
      stable: ['night shifts'],
      temporary: ['exam week'],
    });
  });

  it('returns null for an empty cell', () => {
    expect(parseContinuityCues('  ')).toBeNull();
  });
});

describe('row → persona payload', () => {
  it('builds persona_meta with the fields the simulator reads and omits empty ones', () => {
    const { rows } = parsePersonaCsv(
      [HEADER, 'meta-01,3,reflect_and_explore,29 F Delhi,"works nights",stable,"sleep better",,"one line"'].join('\n'),
    );
    const meta = personaMetaFromRow(rows[0]);

    expect(meta.personaId).toBe('meta-01');
    expect(meta.personaVersion).toBe('3');
    expect(meta.trajectory).toBe('stable');
    expect(meta.openerStyle).toBe('one line');
    expect(meta.goals).toEqual(['sleep better']);
    expect(meta.demographics).toBe('29 F Delhi');
    expect('continuityCues' in meta).toBe(false);
  });

  it('turns sample starters into the persona seed script', () => {
    const { rows } = parsePersonaCsv([HEADER, 'seed-01,1,reflect_and_explore,,p,,,,,"hi;hello"'].join('\n'));
    expect(seedTurnsFromRow(rows[0])).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'user', text: 'hello' },
    ]);
  });

  /**
   * A sheet written by a clinician does not use the canonical column names.
   * These headers are the difference between "the page works" and "the page
   * asks a clinical reviewer to learn a schema".
   */
  describe('friendly headers', () => {
    it('reads name/age/situation and derives a slug id', () => {
      const csv = [
        'Name,Age,Situation,How they talk,Wants',
        'Ananya Sharma,24,"Panic attacks before work presentations since a promotion in June","short sentences, apologetic","to stop dreading Mondays"',
      ].join('\n');

      const { rows } = parsePersonaCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].personaId).toBe('ananya-sharma');
      expect(rows[0].demographics).toBe('age 24');
      expect(rows[0].profile).toContain('Panic attacks before work presentations');
      expect(rows[0].openerStyle).toBe('short sentences, apologetic');
      expect(rows[0].goals).toEqual(['to stop dreading Mondays']);
      expect(isImportable(rows[0])).toBe(true);
      // No rubric → runnable but ungraded, stated as a warning not an error.
      expect(rows[0].warnings.join(' ')).toContain('UNGRADED');
    });

    it('leaves an already-slugged id untouched', () => {
      const { rows } = parsePersonaCsv(['personaId,situation', 'grief-job-loss-01,"lost her job"'].join('\n'));
      expect(rows[0].personaId).toBe('grief-job-loss-01');
    });

    it('keeps an explicit demographics cell alongside a bare age column', () => {
      const { rows } = parsePersonaCsv(['personaId,age,demographics', 'x-01,31,"F, Pune, designer"'].join('\n'));
      expect(rows[0].demographics).toBe('age 31 · F, Pune, designer');
    });
  });
});
