import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { Shield, Download } from 'lucide-react';

export default function AuditLogsPage() {
  const { auditLogsList, settings, showToast } = useData();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [moduleFilter, setModuleFilter] = useState('All');

  const actionColors = { CREATE:'badge-success', UPDATE:'badge-info', DELETE:'badge-error', GENERATE:'badge-warning', SUBMIT:'badge-neutral' };
  const allActions = [...new Set(auditLogsList.map(l => l.action))];
  const allModules = [...new Set(auditLogsList.map(l => l.module))];

  const filtered = useMemo(() => auditLogsList.filter(l => {
    const ms = l.user.toLowerCase().includes(search.toLowerCase()) || l.entity.toLowerCase().includes(search.toLowerCase()) || l.module.toLowerCase().includes(search.toLowerCase());
    const ma = actionFilter === 'All' || l.action === actionFilter;
    const mm = moduleFilter === 'All' || l.module === moduleFilter;
    return ms && ma && mm;
  }), [auditLogsList, search, actionFilter, moduleFilter]);

  const exportLogs = async (format) => {
    try {
      await downloadOfficialFile(format, {
        settings,
        title: 'Audit Logs',
        subtitle: 'Complete activity history for compliance and security',
        details: [
          { label: 'Entries', value: filtered.length },
          { label: 'Action Filter', value: actionFilter },
          { label: 'Module Filter', value: moduleFilter },
        ],
        columns: ['Timestamp', 'User', 'Action', 'Module', 'Entity', 'IP Address'],
        rows: filtered.map((l) => [l.time, l.user, l.action, l.module, l.entity, l.ip]),
        filename: 'audit_logs',
      });
      showToast(`Audit logs exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Audit log export failed', 'error');
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Audit Logs</h1><p>Complete activity history for compliance and security</p></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline btn-sm" onClick={()=>exportLogs('pdf')}><Download size={16}/> PDF</button>
          <button className="btn btn-outline btn-sm" onClick={()=>exportLogs('docx')}><Download size={16}/> DOCX</button>
        </div>
      </div></div>
      <div className="table-container">
        <div className="table-header">
          <span className="table-title"><Shield size={16} style={{marginRight:6,verticalAlign:'middle'}}/> {filtered.length} Log Entries</span>
          <div style={{display:'flex',gap:8}}>
            <input className="form-input search-input" placeholder="Search logs..." style={{width:200}} value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-select" style={{width:130}} value={actionFilter} onChange={e=>setActionFilter(e.target.value)}><option value="All">All Actions</option>{allActions.map(a=><option key={a}>{a}</option>)}</select>
            <select className="form-select" style={{width:130}} value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option value="All">All Modules</option>{allModules.map(m=><option key={m}>{m}</option>)}</select>
          </div>
        </div>
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>Entity</th><th>IP Address</th></tr></thead>
          <tbody>
            {filtered.map(l=>(
              <tr key={l.id}>
                <td style={{fontFamily:'monospace',fontSize:12}}>{l.time}</td>
                <td style={{fontWeight:500}}>{l.user}</td>
                <td><span className={`badge ${actionColors[l.action]||'badge-neutral'}`}>{l.action}</span></td>
                <td>{l.module}</td>
                <td style={{color:'var(--text-muted)'}}>{l.entity}</td>
                <td style={{fontFamily:'monospace',fontSize:12}}>{l.ip}</td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan="6" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No logs found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
