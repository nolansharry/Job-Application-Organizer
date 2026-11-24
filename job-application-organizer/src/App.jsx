import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Filter,
  MapPin,
  PencilLine,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import './App.css'

const STORAGE_KEY = 'job-organizer-applications'
const PROFILE_KEY = 'job-organizer-profile'
const STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected', 'Saved']
const DOCUMENT_TYPES = ['Resume', 'CV', 'Cover letter', 'Portfolio', 'Writing sample', 'References', 'Transcript', 'Other']
const DB_NAME = 'job-organizer-documents'
const DB_STORE = 'files'

const emptyApplication = {
  company: '',
  position: '',
  dateApplied: new Date().toISOString().slice(0, 10),
  status: 'Applied',
  location: '',
}

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function openDocumentDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('Browser file storage is unavailable.'))
      return
    }
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function documentRequest(mode, action, value) {
  const database = await openDocumentDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, mode)
    const store = transaction.objectStore(DB_STORE)
    const request = action === 'all' ? store.getAll() : store[action](value)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function documentTitleFromFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, '')
}

function App() {
  const [applications, setApplications] = useState(() => readStorage(STORAGE_KEY, []))
  const [profile, setProfile] = useState(() => readStorage(PROFILE_KEY, {
    name: '',
    email: '',
    linkedin: '',
  }))
  const [documents, setDocuments] = useState([])
  const [view, setView] = useState('applications')
  const [filters, setFilters] = useState({
    position: '',
    company: '',
    dateApplied: '',
    status: '',
    location: '',
  })
  const [form, setForm] = useState(emptyApplication)
  const [editingId, setEditingId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [documentDialog, setDocumentDialog] = useState(null)
  const [previewDocument, setPreviewDocument] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadQueue, setUploadQueue] = useState([])
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadType, setUploadType] = useState('')
  const [uploadSaving, setUploadSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(applications))
  }, [applications])

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  }, [profile])

  useEffect(() => {
    let active = true
    documentRequest('readonly', 'all').then((files) => {
      if (active) setDocuments(files.sort((a, b) => b.uploadedAt - a.uploadedAt))
    }).catch(() => {
      if (active) setNotice('Document storage is not available in this browser.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!previewDocument?.file) return
    const url = URL.createObjectURL(previewDocument.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewDocument])

  useEffect(() => {
    if (!previewDocument) return
    function closeOnEscape(event) {
      if (event.key === 'Escape') setPreviewDocument(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [previewDocument])

  const filteredApplications = useMemo(() => applications.filter((application) => (
    application.position.toLowerCase().includes(filters.position.toLowerCase())
    && application.company.toLowerCase().includes(filters.company.toLowerCase())
    && (!filters.dateApplied || application.dateApplied === filters.dateApplied)
    && (!filters.status || application.status === filters.status)
    && application.location.toLowerCase().includes(filters.location.toLowerCase())
  )), [applications, filters])

  const activeCount = applications.filter((application) => (
    application.status === 'Applied' || application.status === 'Interview'
  )).length

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  function openNewForm() {
    setForm(emptyApplication)
    setEditingId(null)
    setFormOpen(true)
  }

  function openEditForm(application) {
    setForm({
      company: application.company,
      position: application.position,
      dateApplied: application.dateApplied,
      status: application.status,
      location: application.location,
    })
    setEditingId(application.id)
    setFormOpen(true)
  }

  function saveApplication(event) {
    event.preventDefault()
    const cleaned = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    )
    if (editingId) {
      setApplications((items) => items.map((item) => (
        item.id === editingId ? { ...item, ...cleaned } : item
      )))
      showNotice('Application updated')
    } else {
      setApplications((items) => [{ ...cleaned, id: crypto.randomUUID() }, ...items])
      showNotice('Application added')
    }
    setFormOpen(false)
    setEditingId(null)
  }

  function removeApplication(id) {
    const linkedFiles = documents.filter((document) => document.applicationId === id)
    setApplications((items) => items.filter((item) => item.id !== id))
    if (linkedFiles.length) {
      setDocuments((items) => items.map((document) => (
        document.applicationId === id ? { ...document, applicationId: '' } : document
      )))
      linkedFiles.forEach((document) => {
        documentRequest('readwrite', 'put', { ...document, applicationId: '' }).catch(() => {})
      })
    }
    showNotice('Application removed')
  }

  function openUploadDialog() {
    setUploadQueue([])
    setUploadTitle('')
    setUploadType('')
    setUploadOpen(true)
  }

  function selectUploadFiles(event) {
    const files = Array.from(event.target.files || [])
    setUploadQueue(files)
    if (files.length) {
      setUploadTitle(documentTitleFromFileName(files[0].name))
      setUploadType('')
    }
    event.target.value = ''
  }

  async function uploadDocument(event) {
    event.preventDefault()
    const file = uploadQueue[0]
    const title = uploadTitle.trim()
    if (!file || !title || !uploadType || uploadSaving) return

    const document = {
      id: crypto.randomUUID(),
      name: title,
      fileName: file.name,
      documentType: uploadType,
      type: file.type || 'application/octet-stream',
      size: file.size,
      uploadedAt: Date.now(),
      file,
    }
    setUploadSaving(true)
    try {
      await documentRequest('readwrite', 'put', document)
      setDocuments((items) => [document, ...items])
      const remainingFiles = uploadQueue.slice(1)
      if (remainingFiles.length) {
        setUploadQueue(remainingFiles)
        setUploadTitle(documentTitleFromFileName(remainingFiles[0].name))
        setUploadType('')
      } else {
        setUploadQueue([])
        setUploadOpen(false)
      }
      showNotice('Document uploaded')
    } catch {
      showNotice('Could not save this file. Check your browser storage settings.')
    } finally {
      setUploadSaving(false)
    }
  }

  async function downloadDocument(document) {
    const url = URL.createObjectURL(document.file)
    const link = window.document.createElement('a')
    link.href = url
    link.download = document.fileName || document.name
    link.click()
    URL.revokeObjectURL(url)
  }

  function openDocumentPreview(document) {
    setPreviewDocument(document)
  }

  function closeDocumentPreview() {
    setPreviewDocument(null)
  }

  async function removeDocument(id) {
    try {
      await documentRequest('readwrite', 'delete', id)
      setDocuments((items) => items.filter((item) => item.id !== id))
      if (previewDocument?.id === id) setPreviewDocument(null)
      setDocumentDialog(null)
      showNotice('Document removed')
    } catch {
      showNotice('Could not remove this document')
    }
  }

  async function renameDocument(event) {
    event.preventDefault()
    const name = documentName.trim()
    if (!name) {
      showNotice('Enter a document name')
      return
    }

    const updatedDocument = {
      ...documentDialog.document,
      name,
      fileName: documentDialog.document.fileName || documentDialog.document.name,
    }
    try {
      await documentRequest('readwrite', 'put', updatedDocument)
      setDocuments((items) => items.map((item) => (
        item.id === updatedDocument.id ? updatedDocument : item
      )))
      if (previewDocument?.id === updatedDocument.id) setPreviewDocument(updatedDocument)
      setDocumentDialog(null)
      showNotice('Document renamed')
    } catch {
      showNotice('Could not rename this document')
    }
  }

  function clearFilters() {
    setFilters({ position: '', company: '', dateApplied: '', status: '', location: '' })
  }

  function fileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView('applications')}>
          <span className="brand-mark"><BriefcaseBusiness size={19} strokeWidth={2.2} /></span>
          <span>Job Application Organizer</span>
        </button>
        <nav className="top-actions" aria-label="Main navigation">
          <button
            className={`icon-button ${view === 'documents' ? 'is-active' : ''}`}
            type="button"
            aria-label="Documents"
            title="Documents"
            onClick={() => setView('documents')}
          ><FileText size={22} /></button>
          <a className="icon-button" href={profile.linkedin || 'https://www.linkedin.com/'} target="_blank" rel="noreferrer" aria-label="Open LinkedIn" title="LinkedIn">
            <span className="linkedin-mark" aria-hidden="true">in</span>
          </a>
          <button
            className={`icon-button ${view === 'profile' ? 'is-active' : ''}`}
            type="button"
            aria-label="Profile"
            title="Profile"
            onClick={() => setView('profile')}
          ><UserRound size={22} /></button>
        </nav>
      </header>

      <main className="main-content">
        {view === 'applications' && (
          <>
            <div className="page-heading">
              <div>
                <h1>Applications</h1>
              </div>
              <button className="primary-button" type="button" onClick={openNewForm}>
                <Plus size={18} /> Add application
              </button>
            </div>

            <section className="summary-row" aria-label="Application summary">
              <div className="summary-item"><span className="summary-number">{applications.length}</span><span>Total applications</span></div>
              <span className="summary-divider" />
              <div className="summary-item"><span className="summary-number">{activeCount}</span><span>In progress</span></div>
            </section>

            <section className="workspace-panel">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="filter-mark"><Filter size={18} /></span>
                  <div><h2>All positions</h2><p>{filteredApplications.length} {filteredApplications.length === 1 ? 'result' : 'results'}</p></div>
                </div>
                {Object.values(filters).some(Boolean) && (
                  <button className="text-button" type="button" onClick={clearFilters}>Clear filters <X size={14} /></button>
                )}
              </div>

              <div className="table-scroll">
                <table className="application-table">
                  <thead>
                    <tr className="filter-row">
                      <th><label htmlFor="filter-position">Position</label><div className="filter-input"><Search size={14} /><input id="filter-position" value={filters.position} onChange={(event) => setFilters({ ...filters, position: event.target.value })} placeholder="Filter positions" /></div></th>
                      <th><label htmlFor="filter-company">Company</label><div className="filter-input"><Search size={14} /><input id="filter-company" value={filters.company} onChange={(event) => setFilters({ ...filters, company: event.target.value })} placeholder="Filter companies" /></div></th>
                      <th><label htmlFor="filter-date">Date applied</label><div className="filter-input date-filter"><input id="filter-date" type="date" value={filters.dateApplied} onChange={(event) => setFilters({ ...filters, dateApplied: event.target.value })} /><CalendarDays size={14} /></div></th>
                      <th><label htmlFor="filter-status">Status</label><div className="filter-input select-filter"><select id="filter-status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><ChevronDown size={14} /></div></th>
                      <th><label htmlFor="filter-location">Location</label><div className="filter-input"><MapPin size={14} /><input id="filter-location" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} placeholder="Filter locations" /></div></th>
                      <th className="actions-heading"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApplications.map((application) => (
                      <tr key={application.id}>
                        <td data-label="Position"><div className="position-cell"><strong>{application.position}</strong></div></td>
                        <td className="company-cell" data-label="Company"><span className="company-avatar">{application.company.slice(0, 1).toUpperCase()}</span><strong>{application.company}</strong></td>
                        <td data-label="Date applied">{formatDate(application.dateApplied)}</td>
                        <td data-label="Status"><span className={`status-pill status-${application.status.toLowerCase()}`}>{application.status}</span></td>
                        <td data-label="Location">{application.location || '—'}</td>
                        <td className="row-actions"><button className="row-icon" type="button" aria-label={`Edit ${application.position} at ${application.company}`} title="Edit application" onClick={() => openEditForm(application)}><PencilLine size={16} /></button><button className="row-icon danger-icon" type="button" aria-label={`Remove ${application.position} at ${application.company}`} title="Remove application" onClick={() => removeApplication(application.id)}><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                    {!filteredApplications.length && (
                      <tr><td className="empty-cell" colSpan="6">
                        <div className="empty-state">
                          <span className="empty-icon">{applications.length ? <Search size={21} /> : <BriefcaseBusiness size={21} />}</span>
                          <h3>{applications.length ? 'No matching applications' : 'Your next opportunity starts here'}</h3>
                          <p>{applications.length ? 'Try adjusting your filters.' : 'Add a position to keep your job search organized.'}</p>
                          {applications.length ? <button className="text-button" type="button" onClick={clearFilters}>Clear filters</button> : <button className="secondary-button" type="button" onClick={openNewForm}><Plus size={16} /> Add your first application</button>}
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === 'documents' && (
          <section className="subpage">
            <div className="page-heading">
              <div><p className="eyebrow"></p><h1>Documents</h1><p className="page-subtitle">Keep resumes and other job-search files close at hand.</p></div>
            </div>
            <div className="document-toolbar">
              <button className="primary-button" type="button" onClick={openUploadDialog}><Upload size={17} /> Upload documents</button>
            </div>
            <div className="document-list">
              <div className="document-list-heading"><h2>All documents</h2><span>{documents.length} files</span></div>
              {documents.length ? documents.map((document) => {
                return <article className="document-row" key={document.id}>
                  <span className="document-type-icon"><FileText size={20} /></span>
                  <button className="document-info document-name-button" type="button" title={`Preview ${document.name}`} onClick={() => openDocumentPreview(document)}><strong>{document.name}</strong><span>{document.documentType || 'Document'} · {fileSize(document.size)} · Added {formatDate(new Date(document.uploadedAt).toISOString().slice(0, 10))}</span></button>
                  <div className="document-actions"><button className="row-icon" type="button" title="Preview document" aria-label={`Preview ${document.name}`} onClick={() => openDocumentPreview(document)}><Eye size={17} /></button><button className="row-icon" type="button" title="Download document" aria-label={`Download ${document.name}`} onClick={() => downloadDocument(document)}><ArrowDownToLine size={17} /></button><button className="row-icon" type="button" title="Rename document" aria-label={`Rename ${document.name}`} onClick={() => { setDocumentName(document.name); setDocumentDialog({ type: 'rename', document }) }}><PencilLine size={16} /></button><button className="row-icon danger-icon" type="button" title="Remove document" aria-label={`Remove ${document.name}`} onClick={() => setDocumentDialog({ type: 'delete', document })}><Trash2 size={16} /></button></div>
                </article>
              }) : <div className="documents-empty"><span className="empty-icon"><FileText size={21} /></span><h3>No documents yet</h3><p>Upload a resume, cover letter, or anything else you need for your search.</p><button className="secondary-button" type="button" onClick={openUploadDialog}><Upload size={16} /> Choose files</button></div>}
            </div>
          </section>
        )}

        {view === 'profile' && (
          <section className="subpage profile-page">
            <div className="page-heading"><div><p className="eyebrow"></p><h1>Profile</h1><p className="page-subtitle">Personalize your organizer and keep your links nearby.</p></div></div>
            <form className="profile-form" onSubmit={(event) => { event.preventDefault(); showNotice('Profile saved') }}>
              <div className="profile-avatar">{profile.name ? profile.name.trim().slice(0, 1).toUpperCase() : <UserRound size={25} />}</div>
              <div className="form-grid profile-fields">
                <label className="field-label">Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Your name" /></label>
                <label className="field-label">Email address<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} placeholder="you@example.com" /></label>
                <label className="field-label full-width">LinkedIn profile<div className="url-input"><ArrowUpRight size={16} /><input type="url" value={profile.linkedin} onChange={(event) => setProfile({ ...profile, linkedin: event.target.value })} placeholder="https://www.linkedin.com/in/your-profile" /></div></label>
              </div>
              <div className="profile-footer"><span>Profile details are saved on this device.</span><button className="primary-button" type="submit"><Check size={17} /> Save profile</button></div>
            </form>
            <button className="back-link" type="button" onClick={() => setView('applications')}><ArrowUpRight size={15} /> Back to applications</button>
          </section>
        )}
      </main>

      <footer className="app-footer"><span>Job Application Organizer</span><button type="button" onClick={() => setView('documents')}>Your documents <ArrowUpRight size={13} /></button></footer>

      {formOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}>
          <section className="application-modal" role="dialog" aria-modal="true" aria-labelledby="application-form-title">
            <div className="modal-heading"><div><p className="eyebrow">APPLICATION DETAILS</p><h2 id="application-form-title">{editingId ? 'Edit application' : 'Add an application'}</h2></div><button className="row-icon close-button" type="button" aria-label="Close" onClick={() => setFormOpen(false)}><X size={19} /></button></div>
            <form onSubmit={saveApplication}>
              <div className="form-grid">
                <label className="field-label">Company name<input required autoFocus value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="e.g. Northstar Studio" /></label>
                <label className="field-label">Position<input required value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="e.g. Product Designer" /></label>
                <label className="field-label">Date applied<input required type="date" value={form.dateApplied} onChange={(event) => setForm({ ...form, dateApplied: event.target.value })} /></label>
                <label className="field-label">Status<div className="field-select"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><ChevronDown size={15} /></div></label>
                <label className="field-label full-width">Location<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="City, region, or remote" /></label>
              </div>
              <div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" type="submit"><Check size={17} /> {editingId ? 'Save changes' : 'Add application'}</button></div>
            </form>
          </section>
        </div>
      )}

      {uploadOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploadSaving) { setUploadOpen(false); setUploadQueue([]) } }}>
          <section className="document-modal upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-document-title">
            <h2 id="upload-document-title">Upload Document</h2>
            <form onSubmit={uploadDocument}>
              <label className="upload-field">Document Title
                <input required autoFocus value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Enter a document title" />
              </label>
              <label className="upload-field">Document Type
                <select required value={uploadType} onChange={(event) => setUploadType(event.target.value)}>
                  <option value="" disabled>Select a document type</option>
                  {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="upload-file-field">File
                <span>Select your document to upload</span>
                <input type="file" multiple onChange={selectUploadFiles} aria-label="Select document files" />
                {uploadQueue.length > 0 && <small>{uploadQueue[0].name}{uploadQueue.length > 1 ? ` · ${uploadQueue.length} files selected` : ''}</small>}
              </label>
              <div className="upload-modal-actions">
                <button className="primary-button" type="submit" disabled={uploadSaving || !uploadQueue.length || !uploadTitle.trim() || !uploadType}>{uploadSaving ? 'Saving...' : uploadQueue.length > 1 ? 'Save & Next' : 'Submit'}</button>
                <button className="secondary-button" type="button" disabled={uploadSaving} onClick={() => { setUploadOpen(false); setUploadQueue([]) }}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {previewDocument && (
        <div className="preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDocumentPreview() }}>
          <section className="document-preview" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
            <header className="document-preview-header">
              <h2 id="document-preview-title">{previewDocument.fileName || previewDocument.name}</h2>
              <div className="document-preview-actions">
                <button className="row-icon" type="button" title="Rename document" aria-label={`Rename ${previewDocument.name}`} onClick={() => { setDocumentName(previewDocument.name); setDocumentDialog({ type: 'rename', document: previewDocument }); closeDocumentPreview() }}><PencilLine size={23} /></button>
                <button className="row-icon" type="button" title="Download document" aria-label={`Download ${previewDocument.name}`} onClick={() => downloadDocument(previewDocument)}><ArrowDownToLine size={25} /></button>
                <button className="row-icon preview-close" type="button" title="Close preview" aria-label="Close document preview" onClick={closeDocumentPreview}><X size={29} /></button>
              </div>
            </header>
            <div className="document-preview-content">
              {previewUrl && (previewDocument.type === 'application/pdf' || previewDocument.fileName?.match(/\.pdf$/i)) ? (
                <iframe className="document-preview-frame" src={previewUrl} title={`Preview of ${previewDocument.name}`} />
              ) : previewUrl && previewDocument.type?.startsWith('image/') ? (
                <div className="document-preview-image-wrap"><img src={previewUrl} alt={previewDocument.name} /></div>
              ) : previewUrl && (previewDocument.type?.startsWith('text/') || previewDocument.fileName?.match(/\.(txt|csv|md)$/i)) ? (
                <iframe className="document-preview-frame document-preview-text" src={previewUrl} title={`Preview of ${previewDocument.name}`} />
              ) : (
                <div className="document-preview-empty">
                  <span className="empty-icon"><FileText size={26} /></span>
                  <h3>Preview unavailable</h3>
                  <p>This file type cannot be previewed in the browser. Download it to view the full document.</p>
                  <button className="secondary-button" type="button" onClick={() => downloadDocument(previewDocument)}><ArrowDownToLine size={16} /> Download document</button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {documentDialog?.type === 'rename' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentDialog(null) }}>
          <section className="document-modal rename-modal" role="dialog" aria-modal="true" aria-labelledby="rename-document-title">
            <h2 id="rename-document-title">New Name</h2>
            <form onSubmit={renameDocument}>
              <input autoFocus required aria-label="New document name" value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="Enter Name Here..." />
              <div className="document-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setDocumentDialog(null)}>Cancel</button>
                <button className="primary-button" type="submit">Confirm</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {documentDialog?.type === 'delete' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentDialog(null) }}>
          <section className="document-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-document-title">
            <h2 id="delete-document-title">Are you sure you would like to delete <strong>{documentDialog.document.name}</strong>?</h2>
            <div className="document-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setDocumentDialog(null)}>Cancel</button>
              <button className="danger-button" type="button" onClick={() => removeDocument(documentDialog.document.id)}>Confirm</button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status"><Check size={16} /> {notice}</div>}
    </div>
  )
}

export default App
