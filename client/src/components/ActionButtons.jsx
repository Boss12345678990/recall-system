import Button from './Button.jsx'
import { ACTION_LABELS } from '../labels.js'
import { allowedActions } from '../utils/recallActions.js'

const VARIANT = { LINE_SENT: 'secondary', CALL_NO_ANSWER: 'secondary', CONFIRM: 'primary' }

export default function ActionButtons({ recall, hasLine, onAction, disabled = false }) {
  return (
    <>
      {allowedActions(recall, hasLine).map((action) => (
        <Button key={action} variant={VARIANT[action]} disabled={disabled} onClick={() => onAction(action)}>
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </>
  )
}
