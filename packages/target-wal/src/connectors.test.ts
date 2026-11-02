import { action, bot, lit, ref, variable, type Statement } from '@rosetta/ir';
import { defaultProfile } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { checkWal, parseLine } from './check.js';
import { lowerBot } from './lower.js';

const opts = { profile: defaultProfile, generatedAt: '2026-11-02', rosettaVersion: '0.0.0' };
const cmd = (
  key: string,
  args: Record<string, ReturnType<typeof lit> | ReturnType<typeof ref>>,
  out?: string,
): Statement =>
  action(`vendor:a360/${key}`, {
    args,
    outputs: out ? { result: ref(out) } : {},
    source: { platform: 'a360', file: 't', nodePath: [0], label: key },
  });
const convert = (body: Statement[], vars: string[] = []) => {
  const text = lowerBot(
    bot('t', body, { variables: vars.map((v) => variable(v, { kind: 'string' })) }),
    opts,
  ).text;
  const lines = text.split('\r\n').filter((l) => l !== '' && !l.startsWith('//'));
  return { text, lines };
};
/** The JSON arrays of a runCSharpCode line must parse after WAL unquoting. */
const unwal = (v: string): string =>
  v.startsWith('"')
    ? v.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'r' ? '\r' : c === 'n' ? '\n' : c))
    : v;
const param = (line: string, name: string): string =>
  unwal(String(parseLine(line)?.params.get(name)));
const jsonParam = (line: string, name: string): unknown => JSON.parse(param(line, name));

describe('ServiceNow', () => {
  const auth = cmd('ServiceNow/Authentication', {
    sessionName: lit('SN'),
    authType: lit('AuthenticateViaPackage'),
    instanceURL: lit('https://dev1.service-now.com/'),
    clientId: lit('cid'),
    clientSecret: lit('sec'),
    username: lit('bot'),
    password: lit('pwd'),
  });

  it('authenticates with OAuth and calls the Table API with the right verbs', () => {
    const { text, lines } = convert(
      [
        auth,
        cmd(
          'ServiceNow/Create_Record',
          {
            sessionName: lit('SN'),
            tableName: lit('incident'),
            fieldType: lit('SELECT_ATTRIBUTE_TYPE_DICTIONARY'),
            tableFieldsDictionary: ref('vFields'),
          },
          'vId',
        ),
        cmd(
          'ServiceNow/Get_Record',
          { sessionName: lit('SN'), tableName: lit('incident'), sysId: ref('vId') },
          'vRec',
        ),
        cmd('ServiceNow/Delete_Record', {
          sessionName: lit('SN'),
          tableName: lit('incident'),
          sys_id: ref('vId'),
        }),
      ],
      ['vId', 'vRec'],
    );
    expect(lines).toContain(
      'setVar --name "${rosettaSnBaseSN}" --value "https://dev1.service-now.com"',
    );
    expect(text).toContain('httpRequest --verb "Post" --url "${rosettaSnBaseSN}/oauth_token.do"');
    expect(text).toContain(
      'mapJson --json "${rosettaSnResponse}" --mappings "$.access_token=${rosettaSnTokenSN}"',
    );
    expect(text).toContain(
      'httpRequest --verb "Post" --url "${rosettaSnBaseSN}/api/now/table/incident" --headers ${rosettaSnHeadersSN} --formatter "Json"',
    );
    expect(text).toContain(
      'mapJson --json "${rosettaSnResponse}" --mappings "$.result.sys_id=${vId}"',
    );
    expect(text).toContain(
      'httpRequest --verb "Get" --url "${rosettaSnBaseSN}/api/now/table/incident/${vId}"',
    );
    expect(text).toContain(
      'httpRequest --verb "Delete" --url "${rosettaSnBaseSN}/api/now/table/incident/${vId}"',
    );
    expect(checkWal(text).filter((p) => p.severity === 'error')).toEqual([]);
    const body = lines.find((l) => l.startsWith('runCSharpCode') && l.includes('fields'));
    expect(jsonParam(body ?? '', 'input')).toEqual([
      { name: 'fields', type: 'StringDictionary<String>', value: '${vFields}' },
    ]);
  });

  it('turns triggers into a scheduling note, not a stub', () => {
    const { text } = convert([cmd('ServiceNow/newRecordTrigger', { tableName: lit('incident') })]);
    expect(text).toContain('IBM RPA has no ServiceNow trigger');
    expect(text).not.toContain('goSub --label Rosetta_');
  });
});

describe('SAP GUI', () => {
  it('maps double and right clicks to click flags', () => {
    const { lines } = convert([
      cmd('SAP/doubleClick', { sessionName: lit('S'), fieldPath: lit('wnd[0]/usr/cntlGRID') }),
      cmd('SAP/rightClick', { sessionName: lit('S'), fieldPath: lit('wnd[0]/usr/cntlGRID') }),
    ]);
    expect(lines).toContain('click --selector "Id" --id "wnd[0]/usr/cntlGRID" --doubleclick');
    expect(lines).toContain('click --selector "Id" --id "wnd[0]/usr/cntlGRID" --rightbutton');
  });

  it('starts the session from the server, client and language', () => {
    const { lines } = convert([
      cmd('SAP/connect', {
        sessionName: lit('S'),
        connectionType: lit('SAP GUI'),
        sapServerName: lit('ERP PRD'),
        clientID: lit('100'),
        secureCredential: ref('vPwd'),
        language: lit('EN'),
      }),
    ]);
    expect(lines).toContain(
      'startSAPSession --connectionstring "ERP PRD" --clientid "100" --password "${vPwd}" --language "EN"',
    );
  });
});

describe('SAP BAPI (SAP .NET Connector)', () => {
  const s = { sessionName: lit('B') };
  const { text, lines } = convert(
    [
      cmd('SAPBAPI/sapBapiConnect', {
        ...s,
        connectionType: lit('CUSTOM_APPLICATION_SERVER'),
        applicationServerHost: lit('10.0.0.5'),
        systemNumber: lit('00'),
        client: lit('100'),
        language: lit('EN'),
        authenticationType: lit('USERNAME_AND_PASSWORD'),
        userName: lit('RFCUSER'),
        userSecureText: ref('vSapPwd'),
      }),
      cmd('SAPBAPI/sapBapiCreateFunction', {
        ...s,
        functionAliasName: lit('F1'),
        bapiName: lit('BAPI_CUSTOMER_GETDETAIL2'),
      }),
      cmd('SAPBAPI/sapBapiSetField', {
        ...s,
        functionAlias: lit('F1'),
        fieldSource: lit('Import'),
        fieldName: lit('CUSTOMERNO'),
        fieldVaue: ref('vCust'),
      }),
      cmd('SAPBAPI/sapBapiSetField', {
        ...s,
        functionAlias: lit('F1'),
        fieldSource: lit('Table'),
        tableName: lit('ITEMS'),
        newRow: lit('true'),
        fieldName: lit('MATNR'),
        fieldVaue: lit('M-01'),
      }),
      cmd('SAPBAPI/sapBapiInvokeFunction', {
        ...s,
        functionAliasName: lit('F1'),
        commitTransaction: lit('true'),
      }),
      cmd(
        'SAPBAPI/sapBapiGetField',
        {
          ...s,
          functionAlias: lit('F1'),
          fieldSource: lit('Structure'),
          structureName: lit('CUSTOMERADDRESS'),
          fieldName: lit('NAME'),
        },
        'vName',
      ),
      cmd(
        'SAPBAPI/sapBapiGetTable',
        { ...s, functionAliasName: lit('F1'), tableName: lit('CUSTOMERBANKDETAIL') },
        'vBanks',
      ),
    ],
    ['vName', 'vBanks'],
  );
  const call = lines.find((l) => l.startsWith('runCSharpCode')) ?? '';

  it('writes one NCo call with every value bound as an input', () => {
    expect(jsonParam(call, 'assemblies')).toEqual([
      { assembly: 'C:\\Program Files\\SAP\\SAP_DotNetConnector3_Net40_x64\\sapnco.dll' },
      { assembly: 'C:\\Program Files\\SAP\\SAP_DotNetConnector3_Net40_x64\\sapnco_utils.dll' },
    ]);
    const inputs = jsonParam(call, 'input') as { name: string; value: string }[];
    expect(inputs.find((i) => i.name === 'host')?.value).toBe('10.0.0.5');
    expect(inputs.find((i) => i.name === 'pwd')?.value).toBe('${vSapPwd}');
    expect(inputs.find((i) => i.name === 'v0')?.value).toBe('${vCust}');
    expect(jsonParam(call, 'output')).toEqual([
      { name: 'result', type: 'String', value: '${rosettaBapiResultF1}' },
    ]);
    const code = param(call, 'code');
    expect(code).toContain('dest.Repository.CreateFunction("BAPI_CUSTOMER_GETDETAIL2")');
    expect(code).toContain('fn.SetValue("CUSTOMERNO", v0);');
    expect(code).toContain('t0.Append();\r\nt0.SetValue("MATNR", v1);');
    expect(code).toContain('BAPI_TRANSACTION_COMMIT');
  });

  it('reads results natively from the JSON', () => {
    expect(lines).toContain(
      'mapJson --json "${rosettaBapiResultF1}" --mappings "$.structures.CUSTOMERADDRESS.NAME=${vName}"',
    );
    expect(lines).toContain(
      'jsonToTable --json "${rosettaBapiResultF1}" --jsonPath "$.tables.CUSTOMERBANKDETAIL" vBanks=value',
    );
    expect(text).not.toContain('goSub --label Rosetta_');
    expect(checkWal(text).filter((p) => p.severity === 'error')).toEqual([]);
  });
});

describe('SAP BAPI workflows', () => {
  it('runs a standard workflow as one NCo call', () => {
    const s = { sessionName: lit('B') };
    const { lines } = convert([
      cmd('SAPBAPI/sapBapiConnect', {
        ...s,
        applicationServerHost: lit('h'),
        systemNumber: lit('00'),
        client: lit('100'),
        userName: lit('U'),
        userSecureText: ref('vPwd'),
      }),
      cmd('SAPBAPI/runStandardWorkFlow', {
        ...s,
        workflowName: lit('BAPI_MATERIAL_GET_DETAIL'),
        commitTransaction: lit('false'),
      }),
    ]);
    const call = lines.find((l) => l.startsWith('runCSharpCode')) ?? '';
    expect(param(call, 'code')).toContain('CreateFunction("BAPI_MATERIAL_GET_DETAIL")');
    expect(param(call, 'code')).not.toContain('BAPI_TRANSACTION_COMMIT');
    expect(jsonParam(call, 'output')).toEqual([
      { name: 'result', type: 'String', value: '${rosettaBapiResultWFBAPIMATERIALGETDETAIL}' },
    ]);
  });
});
