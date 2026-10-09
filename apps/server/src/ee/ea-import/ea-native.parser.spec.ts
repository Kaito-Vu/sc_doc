import { isEaNativeDocument, parseEaNative } from './ea-native.parser';

function buildSampleNative(): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Package name="ROOT:My Package" guid="{P1}">',
    '<Table name="t_package">',
    '<Row><Column name="PACKAGE_ID" value="1"/><Column name="NAME" value="ROOT:My Package"/><Column name="PARENT_ID" value="0"/><Column name="EA_GUID" value="{P1}"/><Column name="TPOS" value="1"/></Row>',
    '<Row><Column name="PACKAGE_ID" value="2"/><Column name="NAME" value="2. Lu&#7891;ng m&#224;n h&#236;nh"/><Column name="PARENT_ID" value="1"/><Column name="EA_GUID" value="{P2}"/><Column name="TPOS" value="2"/></Row>',
    '<Row><Column name="PACKAGE_ID" value="3"/><Column name="NAME" value="1. M&#244; t&#7843; chi ti&#7871;t"/><Column name="PARENT_ID" value="1"/><Column name="EA_GUID" value="{P3}"/><Column name="TPOS" value="1"/></Row>',
    '</Table>',
    '<Table name="t_object">',
    '<Row><Column name="OBJECT_ID" value="100"/><Column name="OBJECT_TYPE" value="ActivityPartition"/><Column name="NAME" value="Lane A"/><Column name="PACKAGE_ID" value="2"/><Column name="PARENTID" value="0"/><Column name="EA_GUID" value="{O100}"/></Row>',
    '<Row><Column name="OBJECT_ID" value="101"/><Column name="OBJECT_TYPE" value="Activity"/><Column name="NAME" value="B&#7855;t &#273;&#7847;u"/><Column name="PACKAGE_ID" value="2"/><Column name="PARENTID" value="100"/><Column name="EA_GUID" value="{O101}"/></Row>',
    '<Row><Column name="OBJECT_ID" value="102"/><Column name="OBJECT_TYPE" value="Activity"/><Column name="NAME" value="X&#7917; l&#253;"/><Column name="PACKAGE_ID" value="2"/><Column name="PARENTID" value="100"/><Column name="EA_GUID" value="{O102}"/></Row>',
    '<Row><Column name="OBJECT_ID" value="103"/><Column name="OBJECT_TYPE" value="Class"/><Column name="NAME" value="Ch&#7885;n Menu"/><Column name="PACKAGE_ID" value="2"/><Column name="PARENTID" value="100"/><Column name="EA_GUID" value="{O103}"/></Row>',
    '</Table>',
    '<Table name="t_connector">',
    '<Row><Column name="CONNECTOR_ID" value="900"/><Column name="CONNECTOR_TYPE" value="Dependency"/><Column name="DIRECTION" value="Source -&gt; Destination"/><Column name="START_OBJECT_ID" value="101"/><Column name="END_OBJECT_ID" value="102"/><Column name="NAME" value=""/></Row>',
    '</Table>',
    '<Table name="t_diagram">',
    '<Row><Column name="DIAGRAM_ID" value="200"/><Column name="PACKAGE_ID" value="2"/><Column name="NAME" value="2. Lu&#7891;ng m&#224;n h&#236;nh"/><Column name="EA_GUID" value="{D1}"/></Row>',
    '</Table>',
    '<Table name="t_diagramobjects">',
    '<Row><Column name="DIAGRAM_ID" value="200"/><Column name="OBJECT_ID" value="101"/><Column name="OBJECTSTYLE" value="DUID=X;ImageID=12345;"/></Row>',
    '</Table>',
    '<Table name="t_image">',
    '<Row><Column name="IMAGEID" value="12345"/><Column name="NAME" value="ImageTest"/><Column name="TYPE" value="Bitmap"/><Column name="IMAGE"',
    ' xmlns:dt="urn:schemas-microsoft-com:datatypes" dt:dt="bin.base64">iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==</Column></Row>',
    '</Table>',
    '<Table name="t_document">',
    '<Row><Column name="DOCID" value="{DOC1}"/><Column name="DOCNAME" value="1. M&#244; t&#7843; chi ti&#7871;t::1.1 Detail"/><Column name="ELEMENTID" value="{DOC1}"/><Column name="ELEMENTTYPE" value="ModelDocument"/><Column name="BINCONTENT"',
    ' xmlns:dt="urn:schemas-microsoft-com:datatypes" dt:dt="bin.base64">UEsDBAoAAAAAA</Column><Column name="SEQUENCE" value="0"/></Row>',
    '</Table>',
    '<Table name="t_xref">',
    '<Row><Column name="NAME" value="Stereotypes"/><Column name="TYPE" value="element"/><Column name="CLIENT" value="{O103}"/><Column name="DESCRIPTION" value="@STEREO;Name=InputData;FQName=DMN1.1::InputData;@ENDSTEREO;"/></Row>',
    '</Table>',
    '</Package>',
  ].join('');
}

describe('isEaNativeDocument', () => {
  it('detects an EA native table export', () => {
    expect(isEaNativeDocument(Buffer.from(buildSampleNative(), 'utf-8'))).toBe(
      true,
    );
  });

  it('treats a BPMN definitions document as non-native', () => {
    const xml =
      '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"/></bpmn:definitions>';
    expect(isEaNativeDocument(Buffer.from(xml, 'utf-8'))).toBe(false);
  });

  it('treats an XMI export as non-native', () => {
    const xml =
      '<?xml version="1.0"?><XMI xmi.version="1.1"><XMI.content/></XMI>';
    expect(isEaNativeDocument(Buffer.from(xml, 'utf-8'))).toBe(false);
  });
});

describe('parseEaNative', () => {
  it('rebuilds packages, lanes, activities, edges, diagrams and documents', () => {
    const result = parseEaNative(Buffer.from(buildSampleNative(), 'utf-8'));

    expect(result.warnings).toHaveLength(0);
    expect(result.roots).toHaveLength(1);
    const root = result.roots[0];
    expect(root.id).toBe('{P1}');
    expect(root.name).toBe('ROOT:My Package');

    expect(root.children.map((child) => child.name)).toEqual([
      '1. Mô tả chi tiết',
      '2. Luồng màn hình',
    ]);

    const flow = root.children[1];
    expect(flow.name).toBe('2. Luồng màn hình');
    expect(flow.lanes.map((lane) => lane.name)).toEqual(['Lane A']);
    expect(flow.lanes[0].activityIds).toEqual(['101', '102', '103']);
    expect(flow.activities.map((activity) => activity.id)).toEqual([
      '101',
      '102',
      '103',
    ]);
    expect(flow.activities[0].laneId).toBe('100');
    expect(flow.edges).toEqual([{ from: '101', to: '102' }]);

    expect(flow.diagrams).toHaveLength(1);
    expect(flow.diagrams[0].name).toBe('2. Luồng màn hình');
    expect(flow.diagrams[0].diagramId).toBe('200');
    expect(flow.diagrams[0].imageId).toBe(12345);
    expect(flow.diagrams[0].subjectIds).toEqual(['101']);

    const embedded = flow.diagrams[0].embeddedImage;
    expect(embedded).toBeDefined();
    expect(embedded?.mimeType).toBe('image/png');
    expect(embedded?.fileName).toBe('ImageTest.png');
    expect(embedded?.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    const docs = root.children[0];
    expect(docs.documents).toHaveLength(1);
    expect(docs.documents[0].ownerName).toBe('1.1 Detail');
    expect(docs.documents[0].base64).toBe('UEsDBAoAAAAAA');
  });

  it('includes Class objects as flow nodes when the package has a lane', () => {
    const result = parseEaNative(Buffer.from(buildSampleNative(), 'utf-8'));
    const flow = result.roots[0].children[1];
    expect(flow.activities.some((activity) => activity.id === '103')).toBe(true);
  });

  it('rejects input containing a DOCTYPE declaration', () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><Package name="P"/>';
    expect(() => parseEaNative(Buffer.from(xml, 'utf-8'))).toThrow();
  });

  it('returns no roots for a document without t_package rows', () => {
    const xml = '<Package name="Empty"></Package>';
    const result = parseEaNative(Buffer.from(xml, 'utf-8'));
    expect(result.roots).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});
