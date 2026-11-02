import type { ActionStmt, Expr } from '@rosetta/ir';
import { pathOf, textOf, type NoteSink } from './expr.js';
import { quote, ref } from './syntax.js';
import type { LowerState } from './commands.js';
import type { NoteInput, WalWriter } from './writer.js';

/**
 * Connector packages converted by hand (ADR-024): ServiceNow (REST Table / Attachment API with
 * OAuth), SAP GUI (session, clicks) and SAP BAPI (SAP .NET Connector through `runCSharpCode`).
 * `runCSharpCode` binds WAL variables with JSON `--input` / `--output` arrays of
 * `{name, type, value}` (IBM RPA 30.0.x reference, examples 1-2). Not verified in Studio yet.
 */

const verify = (text: string): NoteInput => ({ kind: 'verify', assumption: 'A-28', text });
const semantic = (text: string): NoteInput => ({ kind: 'semantic', text });
const manualNote = (text: string): NoteInput => ({ kind: 'manual', text });

/** Argument by attribute name; option children may be lifted with or without their parent path. */
function arg(a: ActionStmt, name: string): Expr | undefined {
  if (a.args[name]) return a.args[name];
  const hit = Object.entries(a.args).find(([k]) =>
    k.replace(/\[[^\]]*\]/g, '').endsWith(`.${name}`),
  );
  return hit?.[1];
}
const lit = (a: ActionStmt, name: string): string | undefined => {
  const e = arg(a, name);
  return e?.kind === 'literal' && e.value !== null ? String(e.value) : undefined;
};
const flag = (a: ActionStmt, name: string): boolean => {
  const v = lit(a, name);
  return v === 'true' || v === 'True';
};
const txt = (a: ActionStmt, name: string, sink: NoteSink): string => {
  const e = arg(a, name);
  return e ? textOf(e, sink) : '';
};
const session = (a: ActionStmt): string => lit(a, 'sessionName') ?? lit(a, 'session') ?? 'Default';
const ident = (s: string): string =>
  s
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/(?:^|\s)(\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/\s/g, '');

/** One `runCSharpCode` line; inputs are passed as text and bound by name in the C# code. */
function runCSharp(
  inputs: readonly { name: string; value: string; type?: string }[],
  outputs: readonly { name: string; type: string; variable: string }[],
  code: string,
  assemblies: readonly string[] = [],
): string {
  const parts = ['runCSharpCode'];
  if (assemblies.length)
    parts.push(`--assemblies ${quote(JSON.stringify(assemblies.map((x) => ({ assembly: x }))))}`);
  if (inputs.length)
    parts.push(
      `--input ${quote(JSON.stringify(inputs.map((i) => ({ name: i.name, type: i.type ?? 'String', value: i.value }))))}`,
    );
  if (outputs.length)
    parts.push(
      `--output ${quote(JSON.stringify(outputs.map((o) => ({ name: o.name, type: o.type, value: ref(o.variable) }))))}`,
    );
  parts.push(`--code ${quote(code)}`);
  return parts.join(' ');
}

/** C# literal for a name chosen at conversion time (table, field, BAPI names). */
const cs = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// ---------------------------------------------------------------- ServiceNow

interface SnSession {
  readonly base: string;
  readonly headers: string;
  readonly token: string;
  readonly api: string;
}
const snSessions = new WeakMap<LowerState, Map<string, SnSession>>();

function snSession(a: ActionStmt, s: LowerState, w: WalWriter, create = false): SnSession {
  const all = snSessions.get(s) ?? new Map<string, SnSession>();
  snSessions.set(s, all);
  const name = session(a);
  const found = all.get(name);
  if (found && !create) return found;
  const id = ident(name);
  const out: SnSession = {
    base: s.helper(`snBase${id}`, (n) => `defVar --name ${n} --type String`),
    headers: s.helper(
      `snHeaders${id}`,
      (n) => `defVar --name ${n} --type StringDictionary --innertype String`,
    ),
    token: s.helper(`snToken${id}`, (n) => `defVar --name ${n} --type String`),
    api: found?.api ?? '',
  };
  all.set(name, out);
  if (!found && !create)
    w.comment(
      `TODO [ROSETTA] ServiceNow session "${name}" was not authenticated in this bot`,
      manualNote(
        `ServiceNow session "${name}": set ${out.base} and the Authorization header first`,
      ),
    );
  return out;
}

const snTmp = (s: LowerState): string =>
  s.helper('snResponse', (n) => `defVar --name ${n} --type String`);
const snJson = (s: LowerState): string =>
  s.helper('snBody', (n) => `defVar --name ${n} --type String`);

/** JSON body from an A360 dictionary variable (fields → values), built in C#. */
function snBody(a: ActionStmt, w: WalWriter, s: LowerState, sink: NoteSink): string | undefined {
  const dict = arg(a, 'tableFieldsDictionary') ?? arg(a, 'nameValuePairDictionary');
  if (dict?.kind !== 'var') return undefined;
  const body = snJson(s);
  w.line(
    runCSharp(
      [{ name: 'fields', type: 'StringDictionary<String>', value: textOf(dict, sink) }],
      [{ name: 'json', type: 'String', variable: body }],
      [
        'var parts = new List<string>();',
        'Func<string,string> q = x => "\\"" + (x ?? "").Replace("\\\\","\\\\\\\\").Replace("\\"","\\\\\\"").Replace("\\r","\\\\r").Replace("\\n","\\\\n") + "\\"";',
        'foreach (var kv in fields) parts.Add(q(kv.Key) + ":" + q(Convert.ToString(kv.Value)));',
        'json = "{" + string.Join(",", parts) + "}";',
      ].join('\r\n'),
    ),
    verify('runCSharpCode: A360 dictionary → JSON body (StringDictionary<String> input)'),
  );
  return ref(body);
}

function lowerServiceNow(a: ActionStmt, cmd: string, w: WalWriter, s: LowerState): boolean {
  const notes: NoteInput[] = [];
  const sink: NoteSink = (n) => notes.push(n);
  const table = (): string => txt(a, 'tableName', sink);
  const out = a.outputs.result?.name;
  const tmp = (): string => snTmp(s);
  const req = (verb: string, url: string, extra = ''): string =>
    `httpRequest --verb "${verb}" --url ${quote(url)} --headers ${ref(snSession(a, s, w).headers)}${extra}`;
  const tableUrl = (id?: string): string => {
    const sn = snSession(a, s, w);
    return `${ref(sn.base)}/api/now/${sn.api ? `${sn.api}/` : ''}table/${table()}${id ? `/${id}` : ''}`;
  };
  const done = (...n: NoteInput[]) => {
    w.note(...notes.splice(0), ...n);
    return true;
  };

  switch (cmd) {
    case 'Authentication': {
      if (lit(a, 'authType') === 'AuthenticateViaControlRoom') {
        const sn = snSession(a, s, w, true);
        w.line(`setVar --name "${ref(sn.base)}" --value "{{ROSETTA: ServiceNow instance URL}}"`);
        w.line(
          `strDictAdd --key "Authorization" --value "Bearer {{ROSETTA: OAuth token}}" --dictionary ${ref(sn.headers)}`,
        );
        return done(
          manualNote(
            'ServiceNow: A360 Control Room OAuth connection has no IBM equivalent; store the token in the IBM vault and read it with getVaultItem',
          ),
        );
      }
      const all = snSessions.get(s) ?? new Map<string, SnSession>();
      snSessions.set(s, all);
      const api = lit(a, 'apiVersion') ?? '';
      const sn0 = snSession(a, s, w, true);
      const sn = { ...sn0, api };
      all.set(session(a), sn);
      const url = txt(a, 'instanceURL', sink).replace(/\/+$/, '');
      w.line(`setVar --name "${ref(sn.base)}" --value ${quote(url)}`);
      const form = `grant_type=password&client_id=${txt(a, 'clientId', sink)}&client_secret=${txt(a, 'clientSecret', sink)}&username=${txt(a, 'username', sink)}&password=${txt(a, 'password', sink)}`;
      w.line(
        `httpRequest --verb "Post" --url "${ref(sn.base)}/oauth_token.do" --formatter "Text" --mediatype "application/x-www-form-urlencoded" --source ${quote(form)} ${tmp()}=value`,
        verify('ServiceNow OAuth password grant (POST /oauth_token.do)'),
        semantic(
          'Credentials go into a form body: values with & or = must be URL-encoded; read secrets with getVaultItem.',
        ),
      );
      w.line(
        `mapJson --json "${ref(tmp())}" --mappings ${quote(`$.access_token=${ref(sn.token)}`)}`,
      );
      w.line(
        `strDictAdd --key "Authorization" --value "Bearer ${ref(sn.token)}" --dictionary ${ref(sn.headers)}`,
      );
      w.line(
        `strDictAdd --key "Accept" --value "application/json" --dictionary ${ref(sn.headers)}`,
      );
      return done();
    }
    case 'Revoke_Authentication': {
      const sn = snSession(a, s, w);
      w.line(
        `httpRequest --verb "Post" --url "${ref(sn.base)}/oauth_revoke_token.do" --formatter "Text" --mediatype "application/x-www-form-urlencoded" --source "token=${ref(sn.token)}"`,
        verify('ServiceNow token revoke (POST /oauth_revoke_token.do)'),
      );
      return done();
    }
    case 'Create_Record':
    case 'Update_Record': {
      const body = snBody(a, w, s, sink);
      if (!body)
        notes.push(
          manualNote(
            `ServiceNow ${cmd}: fields given as an entry list; write them as a JSON object into the body`,
          ),
        );
      const id = cmd === 'Update_Record' ? txt(a, 'sys_id', sink) : undefined;
      w.line(
        req(
          cmd === 'Create_Record' ? 'Post' : 'Patch',
          tableUrl(id),
          ` --formatter "Json" --mediatype "application/json" --source ${body ? quote(body) : '"{{ROSETTA: JSON body}}"'} ${tmp()}=value`,
        ),
        verify(
          `ServiceNow Table API ${cmd === 'Create_Record' ? 'POST' : 'PATCH'} /api/now/table/{table}`,
        ),
      );
      if (cmd === 'Create_Record' && out)
        w.line(`mapJson --json "${ref(tmp())}" --mappings ${quote(`$.result.sys_id=${ref(out)}`)}`);
      return done();
    }
    case 'Delete_Record':
      w.line(
        req('Delete', tableUrl(txt(a, 'sys_id', sink))),
        verify('ServiceNow Table API DELETE'),
      );
      return done();
    case 'Get_Record': {
      w.line(
        `${req('Get', tableUrl(txt(a, 'sysId', sink)))} ${tmp()}=value`,
        verify('ServiceNow Table API GET record'),
      );
      if (out)
        w.line(
          runCSharp(
            [{ name: 'json', value: ref(tmp()) }],
            [{ name: 'fieldMap', type: 'StringDictionary<String>', variable: out }],
            [
              'fieldMap = new Dictionary<string, string>();',
              'var body = json.Substring(json.IndexOf("\\"result\\"") + 8);',
              'foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(body, "\\"([^\\"]+)\\"\\\\s*:\\\\s*\\"((?:\\\\\\\\.|[^\\"\\\\\\\\])*)\\""))',
              '  if (!fieldMap.ContainsKey(m.Groups[1].Value)) fieldMap[m.Groups[1].Value] = System.Text.RegularExpressions.Regex.Unescape(m.Groups[2].Value);',
            ].join('\r\n'),
          ),
          verify('runCSharpCode: ServiceNow record JSON → dictionary'),
          semantic(
            'Reference fields come back as their sys_id (value); A360 returns the same by default.',
          ),
        );
      return done();
    }
    case 'List_Record': {
      const q = txt(a, 'query', sink);
      const limit = txt(a, 'limit', sink);
      const params = [q ? `sysparm_query=${q}` : '', limit ? `sysparm_limit=${limit}` : '']
        .filter(Boolean)
        .join('&');
      w.line(
        `${req('Get', tableUrl() + (params ? `?${params}` : ''))} ${tmp()}=value`,
        verify('ServiceNow Table API GET list'),
      );
      if (arg(a, 'nameValuePairDictionary') || arg(a, 'nameValuePairEntryList'))
        notes.push(
          manualNote(
            'ServiceNow List_Record: A360 name/value filters → add them to sysparm_query (field=value^field2=value2)',
          ),
        );
      if (out)
        w.line(
          `jsonToTable --json "${ref(tmp())}" --jsonPath "$.result" ${out}=value`,
          semantic(
            'A360 returns a list of dictionaries; WAL returns a DataTable (one row per record).',
          ),
        );
      return done();
    }
    case 'Add_Attachment': {
      const sn = snSession(a, s, w);
      const file = arg(a, 'filePath');
      const url = `${ref(sn.base)}/api/now/attachment/file?table_name=${table()}&table_sys_id=${txt(a, 'table_sys_id', sink)}&file_name=${txt(a, 'fileName', sink)}`;
      w.line(
        req(
          'Post',
          url,
          ` --formatter "Bytes" --mediatype "application/octet-stream" --file ${file ? pathOf(file, sink) : '"{{ROSETTA: file}}"'} ${tmp()}=value`,
        ),
        verify('ServiceNow Attachment API POST /api/now/attachment/file'),
      );
      if (out)
        w.line(`mapJson --json "${ref(tmp())}" --mappings ${quote(`$.result.sys_id=${ref(out)}`)}`);
      return done();
    }
    case 'Delete_Attachment': {
      const sn = snSession(a, s, w);
      w.line(
        req('Delete', `${ref(sn.base)}/api/now/attachment/${txt(a, 'attachment_sys_id', sink)}`),
        verify('ServiceNow Attachment API DELETE'),
      );
      return done();
    }
    case 'Get_Attachment':
    case 'assignFileToVariable': {
      const sn = snSession(a, s, w);
      const id = txt(a, cmd === 'Get_Attachment' ? 'filterBySysId' : 'attachmentSysId', sink);
      if (!id) {
        w.line(
          `${req('Get', `${ref(sn.base)}/api/now/attachment?sysparm_query=table_name=${table()}^table_sys_id=${txt(a, 'tableSysId', sink)}`)} ${tmp()}=value`,
          verify('ServiceNow Attachment API list'),
        );
        return done(
          manualNote(
            'ServiceNow Get_Attachment by record/query: loop over $.result[*].sys_id and download each with httpStreamToFile',
          ),
        );
      }
      const file = s.helper('snFile', (n) => `defVar --name ${n} --type String`);
      w.line(
        `httpStreamToFile --url "${ref(sn.base)}/api/now/attachment/${id}/file" --headers ${ref(sn.headers)} ${file}=value`,
        verify('httpStreamToFile returns the downloaded file path'),
      );
      const folder = txt(a, 'folderPath', sink);
      if (folder)
        w.line(
          `fileCopy --from "${ref(file)}" --to ${quote(`${folder}\\`)}`,
          semantic(
            'A360 saves under the attachment name; WAL copies the downloaded file into the folder.',
          ),
        );
      if (out) w.line(`setVar --name "${ref(out)}" --value "${ref(file)}"`);
      return done();
    }
    case 'ServiceNowWebTrigger':
    case 'newRecordTrigger':
    case 'updatedRecordTrigger':
      w.comment(`A360 ServiceNow ${cmd}: IBM RPA has no ServiceNow trigger.`);
      w.comment('Schedule this bot in IBM RPA Control Center and poll the table, e.g.');
      w.comment(
        'GET /api/now/table/<table>?sysparm_query=sys_updated_on>javascript:gs.minutesAgoStart(5)',
      );
      w.note(
        manualNote(
          `ServiceNow ${cmd}: replace the trigger with a scheduled bot that polls the Table API`,
        ),
      );
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- SAP GUI

function lowerSapGui(a: ActionStmt, cmd: string, w: WalWriter): boolean {
  const notes: NoteInput[] = [];
  const sink: NoteSink = (n) => notes.push(n);
  const id = (): string => quote(txt(a, 'fieldPath', sink));
  switch (cmd) {
    case 'connect': {
      if (lit(a, 'connectionType') === 'SAP SSO') {
        w.line(
          `startSAPSession --connectionstring ${quote(txt(a, 'sapSSOServerName', sink))} --clientid "{{ROSETTA: client}}" --password "{{ROSETTA: password}}" --language "{{ROSETTA: language}}"`,
          manualNote(
            'SAP SSO: IBM startSAPSession asks for client, password and language; with SSO, start SAP Logon with SNC and use attachSAPSession instead',
          ),
        );
        return true;
      }
      w.line(
        `startSAPSession --connectionstring ${quote(txt(a, 'sapServerName', sink))} --clientid ${quote(txt(a, 'clientID', sink))} --password ${quote(txt(a, 'secureCredential', sink))} --language ${quote(txt(a, 'language', sink) || 'EN')}`,
        verify('startSAPSession (connection string = SAP Logon entry / server)'),
        semantic(
          `SAP user ${txt(a, 'secureUser', sink) || '(credential)'} : IBM startSAPSession has no user parameter; it uses the SAP Logon defaults. Read the password with getVaultItem.`,
        ),
        ...notes,
      );
      return true;
    }
    case 'sendVirtualkey': {
      const key = lit(a, 'virtualKeyToSend') ?? '';
      const named: Record<string, string> = {
        Enter: '{ENTER}',
        Back: '{F3}',
        Exit: '{F3}',
        Save: '^s',
        Cancel: '{F12}',
        Tab: '{TAB}',
        Escape: '{ESC}',
      };
      const fn = /^(?:Shift\+|Ctrl\+)?F(\d{1,2})$/i.exec(key);
      const keys =
        named[key] ??
        (fn
          ? `${/^Shift/i.test(key) ? '+' : /^Ctrl/i.test(key) ? '^' : ''}{F${fn[1] ?? ''}}`
          : undefined);
      if (!keys) return false;
      w.line(
        `sendKeys --keys ${quote(keys)}`,
        verify('sendKeys with SendKeys notation to the SAP GUI window'),
      );
      return true;
    }
    case 'doubleClick':
    case 'rightClick':
      w.line(
        `click --selector "Id" --id ${id()} ${cmd === 'doubleClick' ? '--doubleclick' : '--rightbutton'}`,
        verify(
          `click ${cmd === 'doubleClick' ? '--doubleclick' : '--rightbutton'} on a SAP GUI scripting id`,
        ),
        ...notes,
      );
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- SAP BAPI (SAP NCo)

interface BapiSet {
  readonly source: string;
  readonly container: string;
  readonly field: string;
  readonly value: string;
  readonly newRow: boolean;
}
interface BapiState {
  connect?: ActionStmt;
  readonly functions: Map<string, { bapi: string; sets: BapiSet[] }>;
  readonly results: Map<string, string>;
}
const bapiStates = new WeakMap<LowerState, Map<string, BapiState>>();
const NCO = 'C:\\Program Files\\SAP\\SAP_DotNetConnector3_Net40_x64\\';

function bapiState(a: ActionStmt, s: LowerState): BapiState {
  const all = bapiStates.get(s) ?? new Map<string, BapiState>();
  bapiStates.set(s, all);
  const name = session(a);
  const st = all.get(name) ?? { functions: new Map(), results: new Map() };
  all.set(name, st);
  return st;
}

function lowerBapi(a: ActionStmt, cmd: string, w: WalWriter, s: LowerState): boolean {
  const notes: NoteInput[] = [];
  const sink: NoteSink = (n) => notes.push(n);
  const st = bapiState(a, s);
  const alias = lit(a, 'functionAliasName') ?? lit(a, 'functionAlias') ?? 'Default';
  /** One SAP NCo call for a function alias: connect, set values, invoke, results as JSON. */
  const invoke = (alias: string, commitFlag: boolean): boolean => {
    const fn = st.functions.get(alias);
    const c = st.connect;
    if (!fn || !c) return false;
    const json = s.helper(`bapiResult${ident(alias)}`, (n) => `defVar --name ${n} --type String`);
    st.results.set(alias, json);
    const conn: Record<string, string> = {
      host: txt(c, 'applicationServerHost', sink),
      msHost: txt(c, 'messageServerHost', sink),
      group: txt(c, 'logonGroup', sink),
      sysId: txt(c, 'systemID', sink),
      sysNr: txt(c, 'systemNumber', sink),
      client: txt(c, 'client', sink),
      lang: txt(c, 'language', sink) || 'EN',
      router: txt(c, 'sapRouter', sink),
      user: txt(c, 'username', sink) || txt(c, 'userName', sink) || '{{ROSETTA: SAP user}}',
      pwd:
        txt(c, 'userSecureText', sink) || txt(c, 'password', sink) || '{{ROSETTA: SAP password}}',
      sncName: txt(c, 'sncName', sink),
      sncQop: txt(c, 'sncProtectionLevel', sink),
      sncLib: txt(c, 'sncLib', sink),
    };
    if (lit(c, 'authenticationType') === 'SNC') {
      conn.user = txt(c, 'sncUserName', sink);
      conn.pwd = txt(c, 'sncUserSecureText', sink);
    }
    const inputs = [
      ...Object.entries(conn).map(([name, value]) => ({ name, value })),
      ...fn.sets.map((x, i) => ({ name: `v${String(i)}`, value: x.value })),
    ];
    const tables = new Map<string, string>();
    const code: string[] = [
      'using SAP.Middleware.Connector;',
      'var cfg = new RfcConfigParameters();',
      `cfg.Add(RfcConfigParameters.Name, ${cs(`ROSETTA_${ident(session(a))}`)});`,
      'if (!string.IsNullOrEmpty(host)) cfg.Add(RfcConfigParameters.AppServerHost, host);',
      'if (!string.IsNullOrEmpty(msHost)) { cfg.Add(RfcConfigParameters.MessageServerHost, msHost); cfg.Add(RfcConfigParameters.LogonGroup, group); cfg.Add(RfcConfigParameters.SystemID, sysId); }',
      'cfg.Add(RfcConfigParameters.SystemNumber, sysNr); cfg.Add(RfcConfigParameters.Client, client);',
      'cfg.Add(RfcConfigParameters.User, user); cfg.Add(RfcConfigParameters.Password, pwd); cfg.Add(RfcConfigParameters.Language, lang);',
      'if (!string.IsNullOrEmpty(router)) cfg.Add(RfcConfigParameters.SAPRouter, router);',
      'if (!string.IsNullOrEmpty(sncName)) { cfg.Add(RfcConfigParameters.SncMode, "1"); cfg.Add(RfcConfigParameters.SncPartnerName, sncName); if (!string.IsNullOrEmpty(sncQop)) cfg.Add(RfcConfigParameters.SncQOP, sncQop); if (!string.IsNullOrEmpty(sncLib)) cfg.Add(RfcConfigParameters.SncLibraryPath, sncLib); }',
      'var dest = RfcDestinationManager.GetDestination(cfg);',
      `var fn = dest.Repository.CreateFunction(${cs(fn.bapi)});`,
    ];
    fn.sets.forEach((x, i) => {
      const v = `v${String(i)}`;
      if (x.source === 'Table') {
        let t = tables.get(x.container);
        if (!t) {
          t = `t${String(tables.size)}`;
          tables.set(x.container, t);
          code.push(`var ${t} = fn.GetTable(${cs(x.container)});`);
        }
        if (x.newRow || i === fn.sets.findIndex((y) => y.container === x.container))
          code.push(`${t}.Append();`);
        code.push(`${t}.SetValue(${cs(x.field)}, ${v});`);
      } else if (x.source === 'Structure')
        code.push(`fn.GetStructure(${cs(x.container)}).SetValue(${cs(x.field)}, ${v});`);
      else code.push(`fn.SetValue(${cs(x.field)}, ${v});`);
    });
    const commit = commitFlag;
    code.push(
      'RfcSessionManager.BeginContext(dest);',
      'fn.Invoke(dest);',
      ...(commit
        ? [
            'var commit = dest.Repository.CreateFunction("BAPI_TRANSACTION_COMMIT");',
            'commit.SetValue("WAIT", "X");',
            'commit.Invoke(dest);',
          ]
        : []),
      'RfcSessionManager.EndContext(dest);',
      'Func<string,string> q = x => "\\"" + (x ?? "").Replace("\\\\","\\\\\\\\").Replace("\\"","\\\\\\"").Replace("\\r","\\\\r").Replace("\\n","\\\\n") + "\\"";',
      'Func<IRfcStructure,string> st = s => { var p = new List<string>(); for (int i = 0; i < s.Metadata.FieldCount; i++) { var f = s.Metadata[i].Name; p.Add(q(f) + ":" + q(s.GetString(f))); } return "{" + string.Join(",", p) + "}"; };',
      'var ex = new List<string>(); var ss = new List<string>(); var ts = new List<string>();',
      'for (int i = 0; i < fn.Metadata.ParameterCount; i++) {',
      '  var m = fn.Metadata[i];',
      '  if (m.Direction == RfcDirection.IMPORT) continue;',
      '  if (m.DataType == RfcDataType.TABLE) { var rows = new List<string>(); foreach (IRfcStructure r in fn.GetTable(m.Name)) rows.Add(st(r)); ts.Add(q(m.Name) + ":[" + string.Join(",", rows) + "]"); }',
      '  else if (m.DataType == RfcDataType.STRUCTURE) ss.Add(q(m.Name) + ":" + st(fn.GetStructure(m.Name)));',
      '  else ex.Add(q(m.Name) + ":" + q(fn.GetString(m.Name)));',
      '}',
      'result = "{\\"exports\\":{" + string.Join(",", ex) + "},\\"structures\\":{" + string.Join(",", ss) + "},\\"tables\\":{" + string.Join(",", ts) + "}}";',
    );
    w.line(
      runCSharp(inputs, [{ name: 'result', type: 'String', variable: json }], code.join('\r\n'), [
        `${NCO}sapnco.dll`,
        `${NCO}sapnco_utils.dll`,
      ]),
      verify(`SAP BAPI ${fn.bapi} through SAP .NET Connector 3.x (runCSharpCode); results as JSON`),
      manualNote(
        `SAP NCo 3.x (x64, .NET 4.x) must be installed on the bot machine; adjust the assembly path if it is not ${NCO}. Read the SAP password with getVaultItem.`,
      ),
      ...(commit
        ? [
            semantic(
              'BAPI_TRANSACTION_COMMIT runs in the same context, as A360 "commit transaction".',
            ),
          ]
        : []),
      ...notes,
    );
    return true;
  };
  switch (cmd) {
    case 'sapBapiConnect':
      st.connect = a;
      w.comment(
        `A360 SAP BAPI connect, session "${session(a)}": used by the SAP .NET Connector call at "Run function"`,
      );
      return true;
    case 'sapBapiCreateFunction':
      st.functions.set(alias, { bapi: txt(a, 'bapiName', sink), sets: [] });
      w.comment(`A360 SAP BAPI create function ${alias} = ${txt(a, 'bapiName', sink)}`);
      return true;
    case 'sapBapiSetField': {
      const fn = st.functions.get(alias);
      if (!fn) return false;
      const source = lit(a, 'fieldSource') ?? 'Import';
      fn.sets.push({
        source,
        container:
          source === 'Table'
            ? txt(a, 'tableName', sink)
            : source === 'Structure'
              ? txt(a, 'structureName', sink)
              : '',
        field: txt(a, 'fieldName', sink),
        value: txt(a, 'fieldVaue', sink),
        newRow: flag(a, 'newRow'),
      });
      w.comment(
        `A360 SAP BAPI set ${alias}.${source === 'Import' ? '' : `${txt(a, source === 'Table' ? 'tableName' : 'structureName', sink)}.`}${txt(a, 'fieldName', sink)}`,
      );
      return true;
    }
    case 'runStandardWorkFlow':
    case 'runCustomWorkFlowAdvanced':
    case 'runCustomWorkFlow': {
      // A360 workflows run one BAPI with a parameter set; the parameter grid has no attribute shape
      // in the package metadata, so its values are listed for the developer (A-28).
      const prebuilt: Record<string, string> = {
        'Create Sales Order': 'BAPI_SALESORDER_CREATEFROMDAT2',
        'Update Sales Aggreement': 'BAPI_CUSTOMERCONTRACT_CHANGE',
      };
      const name = txt(a, 'workflowName', sink);
      const bapi = cmd === 'runCustomWorkFlow' ? prebuilt[lit(a, 'workflowName') ?? ''] : name;
      if (!bapi || !st.connect) return false;
      const wf = `WF${ident(name)}`;
      st.functions.set(wf, { bapi, sets: [] });
      w.comment(`A360 SAP BAPI ${cmd} "${name}" → ${bapi}; set its parameters before the call:`);
      for (const [k, e] of Object.entries(a.args).filter(([k]) => k.includes('parameters')))
        w.comment(`  ${k} = ${textOf(e, sink)}`);
      notes.push(
        manualNote(
          `SAP BAPI workflow ${name}: add one fn.SetValue / table Append+SetValue line per workflow parameter in the C# code`,
        ),
      );
      return invoke(wf, flag(a, 'commitTransaction'));
    }
    case 'sapBapiInvokeFunction':
      return invoke(alias, flag(a, 'commitTransaction'));
    case 'sapBapiGetField': {
      const json = st.results.get(alias);
      const out = a.outputs.result?.name;
      if (!json || !out) return false;
      const src = lit(a, 'fieldSource') ?? 'Export';
      const field = txt(a, 'fieldName', sink);
      const path =
        src === 'Table'
          ? `$.tables.${txt(a, 'tableName', sink)}[0].${field}`
          : src === 'Structure'
            ? `$.structures.${txt(a, 'structureName', sink)}.${field}`
            : `$.exports.${field}`;
      w.line(
        `mapJson --json "${ref(json)}" --mappings ${quote(`${path}=${ref(out)}`)}`,
        verify('mapJson on the BAPI result JSON'),
        ...(src === 'Table' ? [semantic('Reads the first row of the table.')] : []),
      );
      return true;
    }
    case 'sapBapiGetTable':
    case 'sapBapiGetStructure': {
      const json = st.results.get(alias);
      const out = a.outputs.result?.name;
      if (!json || !out) return false;
      const path =
        cmd === 'sapBapiGetTable'
          ? `$.tables.${txt(a, 'tableName', sink)}`
          : `$.structures.${txt(a, 'structureName', sink)}`;
      w.line(
        `jsonToTable --json "${ref(json)}" --jsonPath ${quote(path)} ${out}=value`,
        verify('jsonToTable on the BAPI result JSON'),
      );
      return true;
    }
    default:
      return false;
  }
}

/** Connector commands with a hand-written conversion; false when not handled here. */
export function lowerConnector(
  a: ActionStmt,
  key: string | undefined,
  w: WalWriter,
  s: LowerState,
): boolean {
  if (!key) return false;
  const [pkg, cmd] = [key.split('/')[0] ?? '', key.split('/').slice(1).join('/')];
  if (pkg === 'ServiceNow') return lowerServiceNow(a, cmd, w, s);
  if (pkg === 'SAP') return lowerSapGui(a, cmd, w);
  if (pkg === 'SAPBAPI') return lowerBapi(a, cmd, w, s);
  return false;
}
