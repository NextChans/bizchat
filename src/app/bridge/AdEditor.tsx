'use client'

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SLOT_DEFS, type SlotKey } from '@/lib/ad/slots'
import type { Segment, TemplateSet } from '@/lib/ad/templates'
import { LMS_MAX_BYTES, composeBody, displayValue, renderMessage, slotsOf, type SlotValues } from '@/lib/ad/render'
import { todayKst, validateSlot, validateValues } from '@/lib/ad/validate'
import { submitAd, type SubmitState } from './actions'

type StoreView = {
  storeName: string
  regionName: string
  storePhone: string
  address: string
  category: string
  industryLabel: string
}

type Props = { store: StoreView; templateSet: TemplateSet }

type Errors = Partial<Record<SlotKey, string>>

const STEP1_REQUIRED: SlotKey[] = ['storeName', 'regionName', 'storePhone']
const STEP1_FIELDS: SlotKey[] = ['storeName', 'regionName', 'storePhone', 'address']

export default function AdEditor({ store, templateSet }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [templateId, setTemplateId] = useState(templateSet.recommendedId)
  const [includeLink, setIncludeLink] = useState(false)
  const [values, setValues] = useState<SlotValues>(() => ({
    storeName: store.storeName,
    regionName: store.regionName,
    storePhone: store.storePhone,
    address: store.address,
  }))
  const [errors, setErrors] = useState<Errors>({})
  const [editing, setEditing] = useState<{ slot: SlotKey; label: string } | null>(null)

  const [state, formAction, pending] = useActionState<SubmitState, FormData>(submitAd, null)
  useEffect(() => {
    if (state?.fieldErrors) setErrors(state.fieldErrors)
  }, [state])

  const tpl = templateSet.templates.find((t) => t.id === templateId) ?? templateSet.templates[0]!
  const slots = useMemo(() => slotsOf(tpl, includeLink), [tpl, includeLink])
  const preview = useMemo(() => renderMessage(tpl, values, includeLink), [tpl, values, includeLink])
  const firstEmpty = slots.find((k) => !values[k])

  const setValue = (slot: SlotKey, value: string) => {
    setValues((v) => ({ ...v, [slot]: value }))
    setErrors(({ [slot]: _drop, ...rest }) => rest)
  }

  const goStep2 = () => {
    const errs: Errors = {}
    const next = { ...values }
    for (const k of STEP1_FIELDS) {
      if (!STEP1_REQUIRED.includes(k) && !values[k]) continue
      const r = validateSlot(k, values[k] ?? '')
      if (r.ok) next[k] = r.value
      else errs[k] = r.error
    }
    setValues(next)
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      setStep(2)
      window.scrollTo({ top: 0 })
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const r = validateValues(slots, values)
    if (!r.ok) {
      e.preventDefault()
      setErrors(r.errors)
    }
  }

  const back = () => {
    if (step === 2) setStep(1)
    else window.history.back()
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={back}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar-title">우리가게 광고 만들기</h1>
        <button type="button" className="help-btn" onClick={() => alert('[목업] 문의 채널은 정해지지 않았습니다.')}>
          <span className="help-ico" aria-hidden>?</span>문의하기
        </button>
      </header>
      <div className="progress" aria-label={`${step}/2 단계`}>
        <span className={step === 1 ? 'on' : ''} />
        <span className={step === 2 ? 'on' : ''} />
      </div>

      {step === 1 ? (
        <main className="content">
          <h2 className="h2">가게 정보를 확인해 주세요</h2>
          <p className="muted small">캐시노트 가입 정보로 미리 채웠어요. 다르면 고쳐 주세요.</p>
          <div className="fields">
            <label className="field">
              <span className="field-label">업종</span>
              <input value={store.category || store.industryLabel} readOnly className="readonly" />
            </label>
            {STEP1_FIELDS.map((k) => {
              const def = SLOT_DEFS[k]
              return (
                <label className="field" key={k}>
                  <span className="field-label">
                    {def.label}
                    {!STEP1_REQUIRED.includes(k) && <em className="optional"> (선택)</em>}
                  </span>
                  <input
                    type={def.kind === 'tel' ? 'tel' : 'text'}
                    inputMode={def.kind === 'tel' ? 'tel' : undefined}
                    value={values[k] ?? ''}
                    maxLength={def.maxLength}
                    placeholder={def.placeholder}
                    aria-invalid={Boolean(errors[k])}
                    onChange={(e) => setValue(k, e.target.value)}
                  />
                  {errors[k] && <span className="field-error">{errors[k]}</span>}
                </label>
              )
            })}
          </div>
          <div className="bottom-bar single">
            <button type="button" className="btn primary" onClick={goStep2}>
              다음
            </button>
          </div>
        </main>
      ) : (
        <form className="content" action={formAction} onSubmit={onSubmit}>
          <input type="hidden" name="templateId" value={tpl.id} />
          <input type="hidden" name="includeLink" value={includeLink ? '1' : '0'} />
          <input type="hidden" name="values" value={JSON.stringify(pick(values, slots))} />

          <h2 className="h2">어떤 내용으로 메시지를 보낼까요?</h2>
          <div className="tpl-tabs" role="radiogroup" aria-label="메시지 유형">
            {templateSet.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === tpl.id}
                className={`tpl-tab ${t.id === tpl.id ? 'active' : ''}`}
                onClick={() => {
                  setTemplateId(t.id)
                  setErrors({})
                }}
              >
                {t.id === templateSet.recommendedId && <span className="badge">추천</span>}
                {t.label}
              </button>
            ))}
          </div>

          <hr className="dashed" />

          <label className="check">
            <input type="checkbox" checked={includeLink} onChange={(e) => setIncludeLink(e.target.checked)} />
            <span className="check-ico" aria-hidden />
            네이버플레이스, 인스타그램 등 링크 주소가 있어요
          </label>

          <div className="preview">
            <p className="preview-title">
              <Segments segs={tpl.title} values={values} errors={errors} tooltipSlot={firstEmpty} onEdit={setEditing} />
            </p>
            <div className="preview-body">
              <Segments segs={composeBody(tpl, includeLink)} values={values} errors={errors} onEdit={setEditing} />
            </div>
          </div>
          <p className={`bytes ${preview.bodyBytes > LMS_MAX_BYTES ? 'over' : ''}`}>
            {preview.bodyBytes.toLocaleString()} / {LMS_MAX_BYTES.toLocaleString()} byte
          </p>

          {state?.formError && (
            <p className="form-error" role="alert">
              {state.formError}
            </p>
          )}

          <div className="bottom-bar">
            <button type="button" className="btn" onClick={() => setStep(1)} disabled={pending}>
              이전
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? '저장 중…' : '완료'}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <SlotSheet
          slot={editing.slot}
          label={editing.label}
          initial={values[editing.slot] ?? ''}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            setValue(editing.slot, v)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function pick(values: SlotValues, keys: SlotKey[]): SlotValues {
  return Object.fromEntries(keys.map((k) => [k, values[k] ?? '']))
}

function Segments({
  segs,
  values,
  errors,
  tooltipSlot,
  onEdit,
}: {
  segs: Segment[]
  values: SlotValues
  errors: Errors
  tooltipSlot?: SlotKey
  onEdit: (e: { slot: SlotKey; label: string }) => void
}) {
  let tooltipShown = false
  return (
    <>
      {segs.map((seg, i) => {
        if (typeof seg === 'string') return <span key={i}>{seg}</span>
        const label = seg.label ?? SLOT_DEFS[seg.slot].label
        const value = values[seg.slot]
        const showTip = !tooltipShown && tooltipSlot === seg.slot && !value
        if (showTip) tooltipShown = true
        return (
          <button
            key={i}
            type="button"
            className={`chip ${value ? 'filled' : 'empty'} ${errors[seg.slot] ? 'error' : ''}`}
            onClick={() => onEdit({ slot: seg.slot, label })}
            aria-label={`${label} ${value ? '수정' : '입력'}`}
          >
            {showTip && <span className="tooltip">눌러서 입력해 주세요</span>}
            {value ? displayValue(seg.slot, value) : label}
            <PencilIcon />
          </button>
        )
      })}
    </>
  )
}

function PencilIcon() {
  return (
    <svg className="pencil" width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
    </svg>
  )
}

function SlotSheet({
  slot,
  label,
  initial,
  onClose,
  onSave,
}: {
  slot: SlotKey
  label: string
  initial: string
  onClose: () => void
  onSave: (v: string) => void
}) {
  const def = SLOT_DEFS[slot]
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    const r = validateSlot(slot, draft)
    if (r.ok) onSave(r.value)
    else setError(r.error)
  }

  const common = {
    ref,
    value: draft,
    maxLength: def.maxLength,
    placeholder: def.placeholder ?? `${label}을(를) 입력해 주세요`,
    'aria-invalid': Boolean(error),
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value)
      setError(null)
    },
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="h3">{label}</h3>
        {def.kind === 'multiline' ? (
          <textarea {...common} rows={4} />
        ) : (
          <input
            {...common}
            type={def.kind === 'date' ? 'date' : def.kind === 'tel' ? 'tel' : def.kind === 'url' ? 'url' : 'text'}
            inputMode={def.kind === 'tel' ? 'tel' : def.kind === 'url' ? 'url' : undefined}
            min={def.kind === 'date' && slot === 'eventEndDate' ? todayKst() : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
          />
        )}
        <div className="sheet-meta">
          {error ? <span className="field-error">{error}</span> : <span />}
          {def.kind !== 'date' && (
            <span className="muted small">
              {[...draft].length}/{def.maxLength}
            </span>
          )}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn primary" onClick={save}>
            입력 완료
          </button>
        </div>
      </div>
    </div>
  )
}
