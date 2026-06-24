;(function () {
  if (window.__TODO_DEP_INJECTED__) return
  window.__TODO_DEP_INJECTED__ = true

  const PLUGIN_NAME = '@aicupa/plugin-todo-dependency'
  const isZh = (navigator.language || '').startsWith('zh')
  const T = isZh
    ? {
        modalTitle: '设置依赖', searchPlaceholder: '搜索 Todo...',
        cancel: '取消', save: '保存', done: '已完成',
        selCount: n => `已选 ${n} 个依赖`, noMatch: '无匹配结果',
        depLabel: '依赖',
      }
    : {
        modalTitle: 'Set Dependencies', searchPlaceholder: 'Search Todos...',
        cancel: 'Cancel', save: 'Save', done: 'Done',
        selCount: n => `${n} selected`, noMatch: 'No matching results',
        depLabel: 'Depends on',
      }

  // ── Service call via CustomEvent ──
  let callSeq = 0
  function callPluginService(method, params) {
    return new Promise((resolve, reject) => {
      const cbEvent = 'tdep-cb-' + (++callSeq)
      const timer = setTimeout(() => { window.removeEventListener(cbEvent, handler); reject(new Error('timeout')) }, 5000)
      const handler = (e) => {
        clearTimeout(timer)
        window.removeEventListener(cbEvent, handler)
        const d = e.detail
        if (d?.ok === false) reject(new Error(d.error || 'failed'))
        else resolve(d)
      }
      window.addEventListener(cbEvent, handler)
      window.dispatchEvent(new CustomEvent('plugin-call-service', {
        detail: { pluginName: PLUGIN_NAME, method, params, callbackEvent: cbEvent },
      }))
    })
  }

  function unwrap(res) {
    const inner = res?.result || res
    return inner?.result !== undefined ? inner.result : inner
  }

  // ── Context menu result listener ──
  let currentFilePath = ''

  window.addEventListener('plugin-command-done', e => {
    const d = e.detail
    if (!d || d.command !== 'setDependency') return
    const r = d.result?.result || d.result
    if (!r?.target) return
    currentFilePath = r.target.filePath || currentFilePath
    allTodos = r.allTodos || []
    showModal(r.target)
  })

  // ── Tree update listener — refresh dep data ──
  window.addEventListener('plugin-tree-updated', () => {
    if (currentFilePath) refreshDepData()
  })

  async function refreshDepData() {
    try {
      const res = await callPluginService('scanAllDeps', { filePath: currentFilePath })
      const data = unwrap(res)
      if (!data) return
      depData = buildDepDisplay(data.todos, data.edges)
      try { localStorage.setItem(DEP_STORAGE_KEY, JSON.stringify(depData)) } catch {}
    } catch {}
  }

  function buildDepDisplay(todos, edges) {
    const display = {}
    for (const [depId, todoId] of edges) {
      if (!display[todoId]) display[todoId] = { deps: [] }
      const dep = todos[depId]
      display[todoId].deps.push({ id: depId, content: dep ? dep.content : '#' + depId })
    }
    return display
  }

  // ── Styles ──
  function injectStyles() {
    if (document.getElementById('tdep-styles')) return
    const s = document.createElement('style')
    s.id = 'tdep-styles'
    s.textContent = `
      .tdep-tag {
        font-size: 10px; color: #999; margin-left: 6px; padding: 1px 6px;
        background: rgba(128,128,128,0.1); border-radius: 4px;
        line-height: 1.4; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; pointer-events: none; max-width: 300px;
        display: inline-block; vertical-align: middle;
        animation: tdepFadeIn 0.15s ease-out;
      }
      @keyframes tdepFadeIn { from { opacity: 0; } }

      .tdep-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center; z-index: 2147483646;
      }
      .tdep-card {
        background: #fff; border-radius: 12px; width: 440px; max-height: 75vh;
        display: flex; flex-direction: column;
        box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        animation: tdepIn 0.15s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #333;
      }
      @keyframes tdepIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } }

      .tdep-header { padding: 16px 20px 12px; }
      .tdep-title { font-size: 15px; font-weight: 600; }
      .tdep-subtitle {
        font-size: 12px; color: #888; margin-top: 4px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .tdep-search { padding: 0 20px 10px; }
      .tdep-search input {
        width: 100%; padding: 7px 12px; border: 1px solid #e0e0e0; border-radius: 6px;
        font-size: 13px; outline: none; background: #fafafa; color: inherit;
        font-family: inherit;
      }
      .tdep-search input:focus { border-color: #1890ff; }

      .tdep-body {
        flex: 1; overflow-y: auto; max-height: 50vh;
        border-top: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;
      }

      .tdep-item {
        display: flex; align-items: center; padding: 8px 20px; cursor: pointer;
        gap: 10px;  font-size: 13px;
      }
      .tdep-item:hover { background: #f5f7fa; }
      .tdep-item.checked { background: #e6f7ff; }

      .tdep-item input[type="checkbox"] {
        width: 16px; height: 16px; flex-shrink: 0; accent-color: #1890ff; cursor: pointer;
      }
      .tdep-item-id { font-size: 11px; color: #999; flex-shrink: 0; min-width: 48px; }
      .tdep-item-content {
        flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .tdep-item-done { font-size: 10px; color: #52c41a; flex-shrink: 0; }

      .tdep-empty { padding: 32px 20px; text-align: center; color: #bbb; font-size: 13px; }

      .tdep-footer {
        padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;
      }
      .tdep-count { font-size: 12px; color: #999; }
      .tdep-actions { display: flex; gap: 8px; }

      .tdep-btn {
        padding: 6px 16px; border: none; border-radius: 6px;
        font-size: 12px; cursor: pointer; background: #f0f0f0; color: #666;
        font-family: inherit;
      }
      .tdep-btn:hover { background: #e0e0e0; }
      .tdep-btn:active { transform: scale(0.97); }
      .tdep-btn-primary { background: #1890ff; color: #fff; }
      .tdep-btn-primary:hover { background: #40a9ff; }
    `
    document.head.appendChild(s)
  }

  // ── Dep data (hover-based lazy display) ──
  const DEP_STORAGE_KEY = 'todo_dep_display'
  let depData = {}

  function loadDepData() {
    try { depData = JSON.parse(localStorage.getItem(DEP_STORAGE_KEY)) || {} } catch { depData = {} }
  }

  let hoverWrap = null

  function showDepTag(wrapEl) {
    const todoId = wrapEl.getAttribute('data-todowrapid')
    const info = depData[todoId]
    if (!info?.deps?.length) return

    const textEl = wrapEl.querySelector('[data-todoid]')
    if (!textEl || textEl.querySelector('.tdep-tag')) return

    const tag = document.createElement('span')
    tag.className = 'tdep-tag'
    tag.textContent = T.depLabel + ': ' + info.deps.map(d => d.content).join(' | ')
    tag.title = info.deps.map(d => '#' + d.id + ' ' + d.content).join('\n')
    textEl.appendChild(tag)
  }

  function removeDepTag(wrapEl) {
    const textEl = wrapEl.querySelector('[data-todoid]')
    if (!textEl) return
    const tag = textEl.querySelector('.tdep-tag')
    if (tag) tag.remove()
  }

  function initHover() {
    document.addEventListener('mouseover', e => {
      const el = e.target.closest?.('[data-todowrapid]')
      if (el === hoverWrap) return

      if (hoverWrap) { removeDepTag(hoverWrap); hoverWrap = null }
      if (!el) return

      hoverWrap = el
      showDepTag(el)
    })

    document.addEventListener('mouseout', e => {
      if (!hoverWrap) return
      const related = e.relatedTarget
      if (related && hoverWrap.contains(related)) return
      if (related && related.closest?.('[data-todowrapid]') === hoverWrap) return

      removeDepTag(hoverWrap)
      hoverWrap = null
    })
  }

  // ── Modal ──
  let modalEl = null
  let modalTarget = null
  let allTodos = []
  let selectedIds = new Set()

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function ensureModal() {
    if (modalEl) return modalEl
    const el = document.createElement('div')
    el.id = 'tdep-modal'
    el.className = 'tdep-backdrop'
    el.style.display = 'none'
    el.innerHTML = `
      <div class="tdep-card">
        <div class="tdep-header">
          <div class="tdep-title">${escHtml(T.modalTitle)}</div>
          <div class="tdep-subtitle" id="tdep-subtitle"></div>
        </div>
        <div class="tdep-search">
          <input type="text" id="tdep-search" placeholder="${escHtml(T.searchPlaceholder)}" spellcheck="false">
        </div>
        <div class="tdep-body" id="tdep-list"></div>
        <div class="tdep-footer">
          <span class="tdep-count" id="tdep-count"></span>
          <div class="tdep-actions">
            <button class="tdep-btn" id="tdep-cancel">${escHtml(T.cancel)}</button>
            <button class="tdep-btn tdep-btn-primary" id="tdep-save">${escHtml(T.save)}</button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(el)

    el.addEventListener('click', e => { if (e.target === el) hideModal() })
    el.querySelector('#tdep-cancel').addEventListener('click', hideModal)
    el.querySelector('#tdep-save').addEventListener('click', handleSave)
    el.querySelector('#tdep-search').addEventListener('input', e => renderList(e.target.value))
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalEl?.style.display !== 'none') hideModal()
    })

    modalEl = el
    return el
  }

  function showModal(target) {
    modalTarget = target
    selectedIds = new Set((target.depIds || []).map(Number))
    ensureModal()

    document.getElementById('tdep-subtitle').textContent = '#' + target.id + '  ' + target.content
    document.getElementById('tdep-search').value = ''
    renderList('')
    updateCount()
    modalEl.style.display = 'flex'
    document.getElementById('tdep-search').focus()
  }

  function hideModal() {
    if (modalEl) modalEl.style.display = 'none'
    modalTarget = null
  }

  function renderList(query) {
    const list = document.getElementById('tdep-list')
    const q = query.toLowerCase()
    const filtered = q
      ? allTodos.filter(i => i.content.toLowerCase().includes(q) || String(i.id).includes(q))
      : allTodos

    if (!filtered.length) {
      list.innerHTML = '<div class="tdep-empty">' + escHtml(T.noMatch) + '</div>'
      return
    }

    list.innerHTML = filtered.map(i => {
      const chk = selectedIds.has(i.id)
      return '<label class="tdep-item' + (chk ? ' checked' : '') + '" data-id="' + i.id + '">'
        + '<input type="checkbox"' + (chk ? ' checked' : '') + '>'
        + '<span class="tdep-item-id">#' + i.id + '</span>'
        + '<span class="tdep-item-content">' + escHtml(i.content) + '</span>'
        + (i.done ? '<span class="tdep-item-done">' + escHtml(T.done) + '</span>' : '')
        + '</label>'
    }).join('')

    list.querySelectorAll('.tdep-item').forEach(el => {
      el.addEventListener('change', () => {
        const id = Number(el.dataset.id)
        const cb = el.querySelector('input')
        if (cb.checked) { selectedIds.add(id); el.classList.add('checked') }
        else { selectedIds.delete(id); el.classList.remove('checked') }
        updateCount()
      })
    })
  }

  function updateCount() {
    const el = document.getElementById('tdep-count')
    if (el) el.textContent = T.selCount(selectedIds.size)
  }

  async function handleSave() {
    if (!modalTarget) return
    try {
      await callPluginService('saveDeps', {
        todoId: modalTarget.id,
        depIds: [...selectedIds],
        filePath: modalTarget.filePath || currentFilePath,
      })
    } catch (e) {}
    hideModal()
  }

  // ── Init ──
  injectStyles()
  loadDepData()
  initHover()
})()
