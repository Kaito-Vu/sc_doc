import { pickPageTitle, pickReportTitle } from './ea-html-report.util';

describe('pickReportTitle', () => {
  it('uses the document <title>', () => {
    const html =
      '<html><head><title>  GS_01: Theo dõi  </title></head><body></body></html>';
    expect(pickReportTitle(html, 'fallback')).toBe('GS_01: Theo dõi');
  });

  it('falls back when there is no title', () => {
    expect(pickReportTitle('<html><body></body></html>', 'report.zip')).toBe(
      'report.zip',
    );
    expect(pickReportTitle(undefined, 'report.zip')).toBe('report.zip');
  });
});

describe('pickPageTitle', () => {
  it('prefers the first <h1>', () => {
    const html =
      '<html><head><title>ignored</title></head><body><h1>Mô tả chi tiết</h1></body></html>';
    expect(pickPageTitle(html, 'diagram')).toBe('Mô tả chi tiết');
  });

  it('falls back to <title> when there is no <h1>', () => {
    const html = '<html><head><title>From title</title></head></html>';
    expect(pickPageTitle(html, 'diagram')).toBe('From title');
  });

  it('falls back to the supplied stem', () => {
    expect(pickPageTitle('<html><body></body></html>', 'diagram')).toBe(
      'diagram',
    );
    expect(pickPageTitle(undefined, 'diagram')).toBe('diagram');
  });
});
