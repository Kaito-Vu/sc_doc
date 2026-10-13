import { parseEaXmi21 } from './ea-xmi21.parser';
import { parseEaNative } from './ea-native.parser';
import { parseEaXmi } from './ea-xmi.parser';
import { buildWireframeDrawioSvg, drawioNodeHtml } from './ea-wireframe';

const element = (id: string, stereotype: string, name: string, doc = '') =>
  `<element xmi:idref="${id}" xmi:type="uml:GUIElement"${name ? ` name="${name}"` : ''}>` +
  `<properties sType="GUIElement" stereotype="${stereotype}"${doc ? ` documentation="${doc}"` : ''}/></element>`;

const XMI = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="EA_Model">
  <packagedElement xmi:type="uml:Package" xmi:id="EAPK_1" name="3.1 MH dang ky"/>
</uml:Model>
<xmi:Extension extender="Enterprise Architect">
  <elements>
    ${element('EAID_WEB', 'WireframeWebsite', 'Webpage1')}
    ${element('EAID_BTN', 'WireframeButton', '&#272;&#259;ng k&#253;')}
    ${element('EAID_TXT', 'WireframeTextBlock', '', 'KHAI B&amp;#193;O')}
    ${element('EAID_OTHER', 'Note', 'not a control')}
  </elements>
  <diagrams>
    <diagram xmi:id="EAID_D1">
      <model package="EAPK_1"/>
      <properties name="3.1 MH dang ky" type="Custom"/>
      <elements>
        <element geometry="Left=600;Top=400;Right=720;Bottom=430;" subject="EAID_BTN" style="fontsz=120;bold=1;"/>
        <element geometry="Left=200;Top=300;Right=400;Bottom=340;" subject="EAID_TXT" style=""/>
        <element geometry="Left=100;Top=100;Right=900;Bottom=600;" subject="EAID_WEB" style=""/>
        <element geometry="Left=0;Top=0;Right=10;Bottom=10;" subject="EAID_OTHER" style=""/>
      </elements>
    </diagram>
  </diagrams>
</xmi:Extension>
</xmi:XMI>`;

describe('EA wireframe -> draw.io', () => {
  it('reads Wireframing controls with geometry, text and font', () => {
    const { roots } = parseEaXmi21(Buffer.from(XMI, 'utf-8'));
    const [diagram] = roots[0].diagrams;
    expect(diagram.wireframe).toEqual([
      {
        kind: 'WireframeButton',
        text: 'Đăng ký',
        x: 600,
        y: 400,
        width: 120,
        height: 30,
        fontSize: 12,
        bold: true,
      },
      {
        kind: 'WireframeTextBlock',
        text: 'KHAI BÁO',
        x: 200,
        y: 300,
        width: 200,
        height: 40,
      },
      {
        kind: 'WireframeWebsite',
        text: 'Webpage1',
        x: 100,
        y: 100,
        width: 800,
        height: 500,
      },
    ]);
  });

  it('builds an SVG preview carrying an editable mxGraph model', () => {
    const { roots } = parseEaXmi21(Buffer.from(XMI, 'utf-8'));
    const svg = buildWireframeDrawioSvg(roots[0].diagrams[0].wireframe!);
    expect(svg).toContain('width="820" height="520" viewBox="0 0 820 520"');

    const content = /content="([^"]*)"/
      .exec(svg)![1]
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    expect(content).toMatch(
      /^<mxfile [^>]*><diagram [^>]*><mxGraphModel><root>/,
    );
    // Largest first: the browser window is drawn behind its controls.
    const cells = [
      ...content.matchAll(/<mxCell id="w\d+" value="([^"]*)" style="([^"]*)"/g),
    ];
    expect(cells.map((c) => c[1])).toEqual(['Webpage1', 'KHAI BÁO', 'Đăng ký']);
    expect(cells[0][2]).toContain('mxgraph.mockup.containers.browserWindow');
    expect(cells[2][2]).toContain('fontStyle=1');
    expect(content).toContain(
      '<mxGeometry x="510" y="310" width="120" height="30" as="geometry"/>',
    );
    // Preview text is escaped and visible without draw.io.
    expect(svg).toContain('>Đăng ký</text>');
  });

  it('renders the editor draw.io node', () => {
    expect(
      drawioNodeHtml({
        src: '/api/files/a/diagram.drawio.svg',
        attachmentId: 'a',
        fileName: 'diagram.drawio.svg',
        size: 1234,
      }),
    ).toBe(
      '<div data-type="drawio" data-src="/api/files/a/diagram.drawio.svg" data-title="diagram.drawio.svg" data-size="1234" data-attachment-id="a" data-align="center"></div>',
    );
  });

  it('reads controls from the native table export (negative tops, t_xref stereotypes)', () => {
    const row = (cols: Record<string, string>) =>
      '<Row>' +
      Object.entries(cols)
        .map(([k, v]) => `<Column name="${k}" value="${v}"/>`)
        .join('') +
      '</Row>';
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?><Package name="P" guid="{P1}">',
      `<Table name="t_package">${row({ PACKAGE_ID: '1', NAME: 'P', PARENT_ID: '0', EA_GUID: '{P1}' })}</Table>`,
      '<Table name="t_object">',
      row({
        OBJECT_ID: '10',
        OBJECT_TYPE: 'GUIElement',
        NAME: '&#272;&#259;ng k&#253;',
        PACKAGE_ID: '1',
        STEREOTYPE: 'WireframeButton',
        EA_GUID: '{O10}',
      }),
      row({
        OBJECT_ID: '11',
        OBJECT_TYPE: 'Text',
        PACKAGE_ID: '1',
        NOTE: 'Ti&#234;u &#273;&#7873;',
        EA_GUID: '{O11}',
      }),
      row({
        OBJECT_ID: '12',
        OBJECT_TYPE: 'Boundary',
        NAME: 'shot',
        PACKAGE_ID: '1',
        EA_GUID: '{O12}',
      }),
      '</Table>',
      `<Table name="t_xref">${row({ NAME: 'Stereotypes', CLIENT: '{O11}', DESCRIPTION: '@STEREO;Name=WireframeTextBlock;FQName=Wireframing::WireframeTextBlock;@ENDSTEREO;' })}</Table>`,
      `<Table name="t_diagram">${row({ DIAGRAM_ID: '5', PACKAGE_ID: '1', NAME: 'MH' })}</Table>`,
      '<Table name="t_diagramobjects">',
      row({
        DIAGRAM_ID: '5',
        OBJECT_ID: '10',
        RECTTOP: '-400',
        RECTLEFT: '600',
        RECTRIGHT: '720',
        RECTBOTTOM: '-430',
        OBJECTSTYLE: 'bold=1;',
      }),
      row({
        DIAGRAM_ID: '5',
        OBJECT_ID: '11',
        RECTTOP: '-300',
        RECTLEFT: '200',
        RECTRIGHT: '400',
        RECTBOTTOM: '-340',
        OBJECTSTYLE: '',
      }),
      row({
        DIAGRAM_ID: '5',
        OBJECT_ID: '12',
        RECTTOP: '-10',
        RECTLEFT: '10',
        RECTRIGHT: '20',
        RECTBOTTOM: '-20',
        OBJECTSTYLE: '',
      }),
      '</Table></Package>',
    ].join('');
    const { roots } = parseEaNative(Buffer.from(xml, 'utf-8'));
    expect(roots[0].diagrams[0].wireframe).toEqual([
      {
        kind: 'WireframeButton',
        text: 'Đăng ký',
        x: 600,
        y: 400,
        width: 120,
        height: 30,
        bold: true,
      },
      {
        kind: 'WireframeTextBlock',
        text: 'Tiêu đề',
        x: 200,
        y: 300,
        width: 200,
        height: 40,
      },
    ]);
  });

  it('reads controls from XMI 1.1 wherever they are nested', () => {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?><XMI xmi.version="1.1" xmlns:UML="omg.org/UML1.3"><XMI.content>',
      '<UML:Model name="EA Model" xmi.id="MX_1"><UML:Namespace.ownedElement>',
      '<UML:Package name="MH" xmi.id="EAPK_1"><UML:Namespace.ownedElement>',
      '<UML:Collaboration xmi.id="C1" name="Collaborations"><UML:Namespace.ownedElement>',
      '<UML:ClassifierRole name="L&#432;u" xmi.id="EAID_BTN"><UML:ModelElement.stereotype><UML:Stereotype name="WireframeButton"/></UML:ModelElement.stereotype></UML:ClassifierRole>',
      '</UML:Namespace.ownedElement></UML:Collaboration>',
      '<UML:Comment xmi.id="EAID_TXT"><UML:ModelElement.taggedValue>',
      '<UML:TaggedValue tag="documentation" value="Ghi ch&#250;"/>',
      '<UML:TaggedValue tag="$ea_xref_property" value="$XREFPROP=$DES=@STEREO;Name=WireframeTextBlock;FQName=Wireframing::WireframeTextBlock;@ENDSTEREO;$DES;"/>',
      '</UML:ModelElement.taggedValue></UML:Comment>',
      '<UML:Class name="Other" xmi.id="EAID_OTHER"/>',
      '</UML:Namespace.ownedElement></UML:Package>',
      '</UML:Namespace.ownedElement></UML:Model>',
      '<UML:Diagram name="MH" xmi.id="D1" diagramType="CustomDiagram" owner="EAPK_1">',
      '<UML:ModelElement.taggedValue><UML:TaggedValue tag="package" value="EAPK_1"/></UML:ModelElement.taggedValue>',
      '<UML:Diagram.element>',
      '<UML:DiagramElement geometry="Left=600;Top=400;Right=720;Bottom=430;" subject="EAID_BTN" style="fontsz=100;"/>',
      '<UML:DiagramElement geometry="Left=200;Top=300;Right=400;Bottom=340;" subject="EAID_TXT" style=""/>',
      '<UML:DiagramElement geometry="Left=0;Top=0;Right=50;Bottom=50;" subject="EAID_OTHER" style=""/>',
      '</UML:Diagram.element></UML:Diagram>',
      '</XMI.content></XMI>',
    ].join('');
    const { roots } = parseEaXmi(Buffer.from(xml, 'utf-8'));
    expect(roots[0].diagrams[0].wireframe).toEqual([
      {
        kind: 'WireframeButton',
        text: 'Lưu',
        x: 600,
        y: 400,
        width: 120,
        height: 30,
        fontSize: 10,
      },
      {
        kind: 'WireframeTextBlock',
        text: 'Ghi chú',
        x: 200,
        y: 300,
        width: 200,
        height: 40,
      },
    ]);
  });
});
