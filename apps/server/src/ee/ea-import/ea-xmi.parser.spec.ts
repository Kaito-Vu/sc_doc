import { parseEaXmi } from './ea-xmi.parser';

const DOC_BASE64 =
  'UEsDBBQAAAAIAJxkSV35ZYTZjgAAALEAAAAHAAAAc3RyLmRhdDWMTQ6CMBCFrzInMEyBQHXligPochJT+wMNpJjS6oL07g4m7r689763U0wOSYXNk7FuUWGsqx53cmtIbo8Kz/fJrmAoi6YFD5pBtKBho9xJgQCzZ+o7CeGwAU8w/BIpeZ6mf5tBT4eCNcuBX1o2xkMpX1BLBQYAAAAAAQABADUAAACzAAAAAAA=';

function buildSampleXmi(): string {
  return [
    '<?xml version="1.0" encoding="windows-1252"?>',
    '<XMI xmi.version="1.1" xmlns:UML="omg.org/UML1.3">',
    '<XMI.header><XMI.documentation><XMI.exporter>Enterprise Architect</XMI.exporter></XMI.documentation></XMI.header>',
    '<XMI.content>',
    '<UML:Model name="EA Model" xmi.id="MX_1">',
    '<UML:Namespace.ownedElement>',
    '<UML:Class name="EARootClass" xmi.id="EAID_root" isRoot="true"/>',
    '<UML:Package name="GS_01:Root" xmi.id="EAPK_ROOT">',
    '<UML:ModelElement.taggedValue><UML:TaggedValue tag="tpos" value="0"/></UML:ModelElement.taggedValue>',
    '<UML:Namespace.ownedElement>',
    '<UML:Package name="2. Second" xmi.id="EAPK_B"><UML:Namespace.ownedElement/></UML:Package>',
    '<UML:Package name="1. First" xmi.id="EAPK_A">',
    '<UML:Namespace.ownedElement>',
    '<UML:Class name="1. First doc" xmi.id="EAID_DOC">',
    '<UML:ModelElement.stereotype><UML:Stereotype name="Document"/></UML:ModelElement.stereotype>',
    '<UML:ModelElement.taggedValue>',
    '<UML:TaggedValue tag="stereotype" value="Document"/>',
    '<UML:TaggedValue tag="tpos" value="0"/>',
    `<UML:TaggedValue tag="modeldocument" xmlns:dt="urn:schemas-microsoft-com:datatypes" dt:dt="bin.base64" type="ModelDocument">${DOC_BASE64}</UML:TaggedValue>`,
    '</UML:ModelElement.taggedValue>',
    '</UML:Class>',
    '</UML:Namespace.ownedElement>',
    '</UML:Package>',
    '</UML:Namespace.ownedElement>',
    '</UML:Package>',
    '</UML:Namespace.ownedElement>',
    '</UML:Model>',
    '<UML:Diagram name="3.1. Wire A" xmi.id="D1" diagramType="CustomDiagram" owner="EAPK_B" toolName="Enterprise Architect 2.5">',
    '<UML:ModelElement.taggedValue><UML:TaggedValue tag="package" value="EAPK_B"/></UML:ModelElement.taggedValue>',
    '<UML:Diagram.element><UML:DiagramElement geometry="Left=0;Top=0;" subject="EAID_subj1" seqno="1" style="DUID=AA;ImageID=12345;"/></UML:Diagram.element>',
    '</UML:Diagram>',
    '<UML:Diagram name="3.2. Wire B" xmi.id="D2" diagramType="CustomDiagram" owner="EAPK_B" toolName="Enterprise Architect 2.5">',
    '<UML:ModelElement.taggedValue><UML:TaggedValue tag="package" value="EAPK_B"/></UML:ModelElement.taggedValue>',
    '<UML:Diagram.element><UML:DiagramElement geometry="Left=0;Top=0;" subject="EAID_subj2" seqno="1" style="DUID=BB;ImageID=67890;"/></UML:Diagram.element>',
    '</UML:Diagram>',
    '</XMI.content>',
    '</XMI>',
  ].join('');
}

describe('parseEaXmi', () => {
  it('parses packages, documents, diagrams and sibling order', () => {
    const result = parseEaXmi(Buffer.from(buildSampleXmi(), 'latin1'));

    expect(result.roots).toHaveLength(1);
    const root = result.roots[0];
    expect(root.name).toBe('GS_01:Root');
    expect(root.id).toBe('EAPK_ROOT');
    expect(root.parentId).toBeNull();
    expect(root.children).toHaveLength(2);

    // Sibling order is derived from the leading integer in the name, not XML order.
    const [first, second] = root.children;
    expect(first.name).toBe('1. First');
    expect(second.name).toBe('2. Second');
    expect(first.parentId).toBe('EAPK_ROOT');
    expect(second.parentId).toBe('EAPK_ROOT');

    expect(first.documents).toHaveLength(1);
    expect(first.documents[0].ownerId).toBe('EAPK_A');
    expect(first.documents[0].ownerName).toBe('1. First doc');
    expect(first.documents[0].base64).toBe(DOC_BASE64);

    expect(second.documents).toHaveLength(0);
    expect(second.diagrams).toHaveLength(2);
    expect(second.diagrams.map((d) => d.diagramId)).toEqual(['D1', 'D2']);
    expect(second.diagrams.map((d) => d.imageId)).toEqual([12345, 67890]);
    expect(second.diagrams.every((d) => d.ownerId === 'EAPK_B')).toBe(true);
    expect(second.diagrams[0].subjectIds).toContain('EAID_subj1');

    expect(result.warnings).toHaveLength(0);
  });

  it('decodes windows-1252 content using the XML declaration', () => {
    const buffer = Buffer.concat([
      Buffer.from(
        '<?xml version="1.0" encoding="windows-1252"?><XMI><XMI.content><UML:Model><UML:Namespace.ownedElement><UML:Package name="c',
        'latin1',
      ),
      Buffer.from([0xe1]),
      Buffer.from(
        'c" xmi.id="P1"/></UML:Namespace.ownedElement></UML:Model></XMI.content></XMI>',
        'latin1',
      ),
    ]);
    const result = parseEaXmi(buffer);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].name).toBe('các');
  });

  it('rejects input containing a DOCTYPE declaration', () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><XMI/>';
    expect(() => parseEaXmi(Buffer.from(xml, 'utf-8'))).toThrow();
  });

  it('imports a modeldocument attached to a diagram (wireframe description)', () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<XMI xmi.version="1.1" xmlns:UML="omg.org/UML1.3">',
      '<XMI.content>',
      '<UML:Model name="EA Model" xmi.id="MX_1">',
      '<UML:Namespace.ownedElement>',
      '<UML:Package name="3. Giao diện" xmi.id="EAPK_1"><UML:Namespace.ownedElement/></UML:Package>',
      '</UML:Namespace.ownedElement>',
      '</UML:Model>',
      '<UML:Diagram name="Win A" xmi.id="D1" diagramType="CustomDiagram" owner="EAPK_1">',
      '<UML:ModelElement.taggedValue>',
      '<UML:TaggedValue tag="package" value="EAPK_1"/>',
      '<UML:TaggedValue tag="modeldocument" xmlns:dt="urn:schemas-microsoft-com:datatypes" dt:dt="bin.base64" type="ModelDocument">',
      DOC_BASE64,
      '</UML:TaggedValue>',
      '</UML:ModelElement.taggedValue>',
      '<UML:Diagram.element/>',
      '</UML:Diagram>',
      '</XMI.content>',
      '</XMI>',
    ].join('');
    const result = parseEaXmi(Buffer.from(xml, 'utf-8'));
    const root = result.roots[0];
    expect(root.diagrams).toHaveLength(1);
    expect(root.documents).toHaveLength(1);
    expect(root.documents[0].base64).toBe(DOC_BASE64);
    expect(root.documents[0].ownerName).toBe('Win A');
  });
});
