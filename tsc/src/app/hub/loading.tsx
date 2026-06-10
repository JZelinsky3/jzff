import { HubSpinner } from './spinner'

export default function HubLoading() {
  return (
    <div className="hub-loading-page">
      <HubSpinner size={52} />
      <div className="hub-loading-text">Setting the type…</div>
    </div>
  )
}
