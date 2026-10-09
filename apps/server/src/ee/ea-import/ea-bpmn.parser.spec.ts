import { isBpmnDocument, parseEaBpmn } from './ea-bpmn.parser';

function buildSampleBpmn(): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    ' xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    ' xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    ' xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
    ' id="Defs_1" targetNamespace="www.sparxsystems.com.au/bpmn20"',
    ' exporter="Enterprise Architect" name="CW_HQ_QL:Quản lý thông tin">',
    '<bpmn:collaboration id="Collab_1">',
    '<bpmn:participant id="Part_1" name="Pool A" processRef="Process_1"/>',
    '</bpmn:collaboration>',
    '<bpmn:process id="Process_1" name="Quản lý thông tin">',
    '<bpmn:laneSet id="LaneSet_1">',
    '<bpmn:lane id="Lane_1" name="Người dùng">',
    '<bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>',
    '<bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>',
    '</bpmn:lane>',
    '<bpmn:lane id="Lane_2" name="Hệ thống">',
    '<bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>',
    '<bpmn:flowNodeRef>End_1</bpmn:flowNodeRef>',
    '</bpmn:lane>',
    '</bpmn:laneSet>',
    '<bpmn:startEvent id="Start_1" name="Bắt đầu"/>',
    '<bpmn:userTask id="Task_1" name="Nhập thông tin"/>',
    '<bpmn:serviceTask id="Task_2" name="Lưu thông tin"/>',
    '<bpmn:endEvent id="End_1" name="Kết thúc"/>',
    '<bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1"/>',
    '<bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2"/>',
    '<bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="End_1" name="xong"/>',
    '</bpmn:process>',
    '<bpmndi:BPMNDiagram id="Diagram_1">',
    '<bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">',
    '<bpmndi:BPMNShape id="Shape_1" bpmnElement="Task_1"/>',
    '</bpmndi:BPMNPlane>',
    '</bpmndi:BPMNDiagram>',
    '</bpmn:definitions>',
  ].join('');
}

describe('isBpmnDocument', () => {
  it('detects a prefixed BPMN definitions document', () => {
    expect(isBpmnDocument(Buffer.from(buildSampleBpmn(), 'utf-8'))).toBe(true);
  });

  it('detects an unprefixed BPMN definitions document', () => {
    const xml =
      '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="P"/></definitions>';
    expect(isBpmnDocument(Buffer.from(xml, 'utf-8'))).toBe(true);
  });

  it('treats an XMI export as non-BPMN', () => {
    const xml =
      '<?xml version="1.0"?><XMI xmi.version="1.1"><XMI.content/></XMI>';
    expect(isBpmnDocument(Buffer.from(xml, 'utf-8'))).toBe(false);
  });
});

describe('parseEaBpmn', () => {
  it('parses a process into lanes, activities, edges and diagrams', () => {
    const result = parseEaBpmn(Buffer.from(buildSampleBpmn(), 'utf-8'));

    expect(result.warnings).toHaveLength(0);
    expect(result.roots).toHaveLength(1);
    const root = result.roots[0];
    expect(root.id).toBe('Process_1');
    expect(root.name).toBe('Quản lý thông tin');
    expect(root.parentId).toBeNull();

    expect(root.lanes.map((lane) => lane.name)).toEqual([
      'Người dùng',
      'Hệ thống',
    ]);
    expect(root.lanes[0].activityIds).toEqual(['Start_1', 'Task_1']);
    expect(root.lanes[1].activityIds).toEqual(['Task_2', 'End_1']);

    expect(root.activities.map((activity) => activity.id)).toEqual([
      'Start_1',
      'Task_1',
      'Task_2',
      'End_1',
    ]);
    const task1 = root.activities.find((activity) => activity.id === 'Task_1');
    expect(task1?.laneId).toBe('Lane_1');

    expect(root.edges).toEqual([
      { from: 'Start_1', to: 'Task_1' },
      { from: 'Task_1', to: 'Task_2' },
      { from: 'Task_2', to: 'End_1', label: 'xong' },
    ]);

    expect(root.diagrams).toHaveLength(1);
    expect(root.diagrams[0].diagramId).toBe('Diagram_1');
    expect(root.diagrams[0].subjectIds).toEqual(['Task_1']);
  });

  it('falls back to the participant name when the process is unnamed', () => {
    const xml = [
      '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" name="Root">',
      '<bpmn:collaboration id="C1"><bpmn:participant id="P1" name="Pool A" processRef="Process_1"/></bpmn:collaboration>',
      '<bpmn:process id="Process_1"/>',
      '</bpmn:definitions>',
    ].join('');
    const result = parseEaBpmn(Buffer.from(xml, 'utf-8'));
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].name).toBe('Pool A');
  });

  it('returns no roots for an empty definitions document', () => {
    const xml =
      '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" name="Empty"/>';
    const result = parseEaBpmn(Buffer.from(xml, 'utf-8'));
    expect(result.roots).toHaveLength(0);
  });

  it('rejects input containing a DOCTYPE declaration', () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><bpmn:definitions/>';
    expect(() => parseEaBpmn(Buffer.from(xml, 'utf-8'))).toThrow();
  });
});
