import { useData } from '../context/DataContext';

/**
 * Reusable College Header Component
 * Used in: Documents, printable pages, sidebar, and Settings preview
 *
 * Variants:
 *  - "full" (default): Full header with logo, name, affiliation, address, accreditations
 *  - "compact": Just logo + name for sidebar/topbar
 *  - "document": Formal header for printed and downloaded documents
 */
export default function CollegeHeader({ variant = 'full', customSettings = null, title = '', subtitle = '', meta = [] }) {
  const { settings: ctxSettings } = useData();
  const s = customSettings || ctxSettings;
  const initials = (s.institutionName || 'CF').substring(0, 2).toUpperCase();

  if (variant === 'compact') {
    return (
      <div className="college-header-compact">
        {s.collegeLogo ? (
          <img src={s.collegeLogo} alt="Logo" className="college-logo-sm" />
        ) : (
          <div className="college-logo-placeholder-sm">{initials}</div>
        )}
        <div className="college-compact-info">
          <div className="college-compact-name">{s.institutionName || 'CampusFlow ERP'}</div>
          {s.affiliation && <div className="college-compact-aff">{s.affiliation}</div>}
        </div>
      </div>
    );
  }

  if (variant === 'document') {
    return (
      <div className="college-header-document">
        <div className="college-doc-row">
          {s.collegeLogo ? (
            <img src={s.collegeLogo} alt="Logo" className="college-logo-doc" />
          ) : (
            <div className="college-logo-placeholder-doc">{initials}</div>
          )}
          <div className="college-doc-center">
            {s.affiliation && <div className="college-doc-univ">{s.affiliation}</div>}
            <h2 className="college-doc-name">{s.institutionName || 'Institution Name'}</h2>
            {s.autonomousStatus && <div className="college-doc-auto">({s.autonomousStatus})</div>}
            {(title || subtitle) && (
              <div className="college-doc-title-block">
                {title && <div className="college-doc-title">{title}</div>}
                {subtitle && <div className="college-doc-subtitle">{subtitle}</div>}
              </div>
            )}
            {s.address && <div className="college-doc-addr">{s.address}</div>}
            <div className="college-doc-contacts">
              {s.phone && <span>Phone: {s.phone}</span>}
              {s.email && <span>Email: {s.email}</span>}
              {s.website && <span>Web: {s.website}</span>}
            </div>
          </div>
          <div className="college-doc-badges">
            {s.naacGrade && <div className="college-badge-naac">NAAC<br /><strong>{s.naacGrade}</strong></div>}
            {s.aisheCode && <div className="college-badge-aishe">AISHE: {s.aisheCode}</div>}
          </div>
        </div>
        {meta.length > 0 && (
          <div className="college-doc-meta-row">
            {meta.map((item) => (
              <div key={item.label} className="college-doc-meta-item">
                <span>{item.label}</span>
                <strong>{item.value || '-'}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="college-doc-divider" />
      </div>
    );
  }

  return (
    <div className="college-header-full">
      <div className="college-header-inner">
        <div className="college-logo-col">
          {s.collegeLogo ? (
            <img src={s.collegeLogo} alt="College Logo" className="college-logo-lg" />
          ) : (
            <div className="college-logo-placeholder-lg">{initials}</div>
          )}
        </div>
        <div className="college-info-col">
          {s.affiliation && <div className="college-univ-name">{s.affiliation}</div>}
          <h1 className="college-main-name">{s.institutionName || 'Your College Name'}</h1>
          {s.autonomousStatus && <div className="college-autonomous">({s.autonomousStatus})</div>}
          {s.motto && <div className="college-motto">"{s.motto}"</div>}
          {s.address && <div className="college-addr">{s.address}</div>}
          <div className="college-contact-row">
            {s.phone && <span>Phone: {s.phone}</span>}
            {s.email && <span>Email: {s.email}</span>}
            {s.website && <span>Web: {s.website}</span>}
          </div>
          <div className="college-accreditation-row">
            {s.naacGrade && <span className="college-pill">NAAC: {s.naacGrade}</span>}
            {s.aisheCode && <span className="college-pill">AISHE: {s.aisheCode}</span>}
            {s.establishedYear && <span className="college-pill">Est. {s.establishedYear}</span>}
            {s.collegeType && <span className="college-pill">{s.collegeType}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
