import Modal from './Modal.jsx'
import Button from './Button.jsx'

export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, pending = false }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-slate-600">{message}</p>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button variant="danger" disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
