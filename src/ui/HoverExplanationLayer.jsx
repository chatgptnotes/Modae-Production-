import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './hover-explanations.css'

const EXPLAINABLE = '[data-explain]'
const SHOW_DELAY = 650
const VIEWPORT_GAP = 12
const TOOLTIP_WIDTH = 320

function explanationTarget(node) {
  return node instanceof Element ? node.closest(EXPLAINABLE) : null
}

function positionFor(target) {
  const rect = target.getBoundingClientRect()
  const left = Math.max(VIEWPORT_GAP, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_GAP))
  const above = rect.top > 150
  return {
    left,
    top: above ? undefined : Math.min(rect.bottom + 10, window.innerHeight - 130),
    bottom: above ? window.innerHeight - rect.top + 10 : undefined,
  }
}

export default function HoverExplanationLayer() {
  const id = useId()
  const timer = useRef(null)
  const activeTarget = useRef(null)
  const [explanation, setExplanation] = useState(null)

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = null
    }
    const hide = () => {
      clearTimer()
      activeTarget.current = null
      setExplanation(null)
    }
    const showAfterPause = target => {
      if (!target || !target.dataset.explain?.trim()) return hide()
      if (activeTarget.current === target) return
      clearTimer()
      activeTarget.current = target
      setExplanation(null)
      timer.current = window.setTimeout(() => {
        if (!target.isConnected || activeTarget.current !== target) return
        const description = target.dataset.explain.trim()
        setExplanation({
          target,
          title: target.dataset.explainTitle || target.getAttribute('aria-label') || target.textContent.trim().slice(0, 70) || 'About this item',
          description,
          position: positionFor(target),
        })
        timer.current = null
      }, SHOW_DELAY)
    }
    const onPointerOver = event => {
      if (event.pointerType === 'touch') return
      const target = explanationTarget(event.target)
      if (target && !target.contains(event.relatedTarget)) showAfterPause(target)
    }
    const onPointerOut = event => {
      const target = explanationTarget(event.target)
      if (target && !target.contains(event.relatedTarget) && activeTarget.current === target) hide()
    }
    const onFocusIn = event => showAfterPause(explanationTarget(event.target))
    const onFocusOut = event => {
      const target = explanationTarget(event.target)
      if (target && !target.contains(event.relatedTarget) && activeTarget.current === target) hide()
    }
    const reposition = () => {
      const target = activeTarget.current
      if (!target?.isConnected) return hide()
      setExplanation(current => current?.target === target
        ? { ...current, position: positionFor(target) }
        : current)
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', hide, true)
    const observer = new MutationObserver(records => {
      const target = activeTarget.current
      if (!target?.isConnected) return hide()
      if (!records.some(record => record.target === target)) return
      setExplanation(current => current?.target === target
        ? {
            ...current,
            title: target.dataset.explainTitle || target.getAttribute('aria-label') || target.textContent.trim().slice(0, 70) || 'About this item',
            description: target.dataset.explain?.trim() || current.description,
          }
        : current)
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-explain', 'data-explain-title'],
      childList: true,
      subtree: true,
    })
    return () => {
      clearTimer()
      observer.disconnect()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  useEffect(() => {
    const target = explanation?.target
    if (!target) return undefined
    const prior = target.getAttribute('aria-describedby')
    const ids = new Set((prior || '').split(/\s+/).filter(Boolean))
    ids.add(`hover-explanation-${id}`)
    target.setAttribute('aria-describedby', [...ids].join(' '))
    return () => {
      if (!target.isConnected) return
      if (prior) target.setAttribute('aria-describedby', prior)
      else target.removeAttribute('aria-describedby')
    }
  }, [explanation, id])

  if (!explanation || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="hover-explanation"
      id={`hover-explanation-${id}`}
      role="tooltip"
      style={explanation.position}
    >
      <strong>{explanation.title}</strong>
      <span>{explanation.description}</span>
    </div>,
    document.body,
  )
}
