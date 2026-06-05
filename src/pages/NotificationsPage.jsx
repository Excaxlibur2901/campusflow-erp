import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Bell, CheckCheck, Calendar, AlertTriangle, Shield, X } from 'lucide-react';

const iconMap = { timetable: Calendar, exam: AlertTriangle, attendance: Bell, system: Shield };

export default function NotificationsPage() {
  const { notificationsList, markAllRead, markRead, deleteNotification } = useData();
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'unread') return notificationsList.filter(n => !n.read);
    if (filter !== 'all') return notificationsList.filter(n => n.type === filter);
    return notificationsList;
  }, [notificationsList, filter]);

  const unreadCount = notificationsList.filter(n => !n.read).length;

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Notifications</h1><p>Stay updated with institutional alerts and changes</p></div>
        <div style={{display:'flex',gap:8}}>
          {unreadCount > 0 && <button className="btn btn-outline btn-sm" onClick={markAllRead}><CheckCheck size={16}/> Mark All Read ({unreadCount})</button>}
        </div>
      </div></div>

      <div className="tabs" style={{marginBottom:20}}>
        {[{id:'all',label:'All'},{id:'unread',label:`Unread (${unreadCount})`},{id:'timetable',label:'Timetable'},{id:'exam',label:'Exam'},{id:'attendance',label:'Attendance'},{id:'system',label:'System'}].map(t=>(
          <button key={t.id} className={`tab ${filter===t.id?'active':''}`} onClick={()=>setFilter(t.id)}>{t.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><Bell size={48}/><h3>No notifications</h3><p>You're all caught up!</p></div>
      ) : (
        <div className="card" style={{padding:0}}>
          {filtered.map(n => {
            const Icon = iconMap[n.type] || Bell;
            return (
              <div key={n.id} className={`notif-item ${!n.read?'unread':''}`} onClick={()=>markRead(n.id)} style={{position:'relative'}}>
                {!n.read && <div className="notif-dot"/>}
                {n.read && <div style={{width:8}}/>}
                <div style={{width:40,height:40,borderRadius:10,background:n.type==='exam'?'var(--warning-bg)':n.type==='attendance'?'var(--error-bg)':'#dbeafe',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <Icon size={18} color={n.type==='exam'?'var(--warning)':n.type==='attendance'?'var(--error)':'var(--accent)'}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>{n.title}</div>
                  <div style={{fontSize:13,color:'var(--text-muted)'}}>{n.message}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{n.time}</div>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--error)',padding:4}} onClick={(e)=>{e.stopPropagation();deleteNotification(n.id);}}><X size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
