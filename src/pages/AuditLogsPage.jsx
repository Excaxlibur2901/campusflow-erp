import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { Shield, Download } from 'lucide-react';

export default function AuditLogsPage() {
  const { getAccessToken } = useAuth();
  const [logsList, setLogsList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchLogs = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/audit?limit=200', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const logs = (data.data || data).map(l => ({
          id: l.id,
          time: l.created_at ? new Date(l.created_at).toLocaleString() : 'N/A',
          user: l.user_email || l.user_name || 'system',
          action: l.action,
          module: l.module,
          entity: l.entity || 'N/A',
          ip: l.ip_address || '127.0.0.1',
        }));
        setLogsList(logs);
      }
    } catch {
      // Best effort load
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const actionColors = { CREATE: 'badge-success', UPDATE: 'badge-info', DELETE: 'badge-error', GENERATE: 'badge-warning', SUBMIT: 'badge-neutral', LOCK: 'badge-error', UNLOCK: 'badge-success' };
  const allActions = useMemo(() => [...new Set(logsList.map(l => l.action))], [logsList]);
  const allModules = useMemo(() => [...new Set(logsList.map(l => l.module))], [logsList]);

  const filtered = useMemo(() => logsList.filter(l => {
    const ms = l.user.toLowerCase().includes(search.toLowerCase()) || l.entity.toLowerCase().includes(search.toLowerCase()) || l.module.toLowerCase().includes(search.toLowerCase());
    const ma = actionFilter === 'All' || l.action === actionFilter;
    const mm = moduleFilter === 'All' || l.module === moduleFilter;
    return ms && ma && mm;
  }), [logsList, search, actionFilter, moduleFilter]);

  const exportLogs = async (format) => {
    try {
      await downloadOfficialFile(format, {
        settings: { institutionName: 'CampusFlow ERP' },
        title: 'System Audit Logs',
        subtitle: 'Complete immutable activity history for compliance and security',
        details: [
          { label: 'Total Entries', value: filtered.length },
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
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, background: toastMsg.type === 'error' ? 'var(--error)' : 'var(--success)', color: '#fff', padding: '10px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 600 }}>
          {toastMsg.text}
        </div>
      )}

      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Audit Logs</h1><p>Complete activity history for compliance and security</p></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => exportLogs('pdf')}><Download size={16} /> PDF</button>
            <button className="btn btn-outline btn-sm" onClick={() => exportLogs('docx')}><Download size={16} /> DOCX</button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title"><Shield size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {filtered.length} Log Entries</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search logs..." style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 130 }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}><option value="All">All Actions</option>{allActions.map(a => <option key={a}>{a}</option>)}</select>
            <select className="form-select" style={{ width: 130 }} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}><option value="All">All Modules</option>{allModules.map(m => <option key={m}>{m}</option>)}</select>
          </div>
        </div>
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>Entity</th><th>IP Address</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading audit logs from database...</td></tr>
            ) : filtered.map(l => (
              <tr key={l.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.time}</td>
                <td style={{ fontWeight: 500 }}>{l.user}</td>
                <td><span className={`badge ${actionColors[l.action] || 'badge-neutral'}`}>{l.action}</span></td>
                <td>{l.module}</td>
                <td style={{ color: 'var(--text-muted)' }}>{l.entity}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.ip}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No logs found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
