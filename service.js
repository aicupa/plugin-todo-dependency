/**
 * @param {import('@aicupa/api').PluginApi} api
 * @returns {import('@aicupa/api').Plugin}
 */
module.exports = (api) => {
  function flattenTodos(nodes, result) {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (node.todo) {
        result.push({
          id: node.todo.id,
          content: node.todo.content,
          done: node.todo.done,
          focus: node.todo.focus || false,
          level: node.todo.level,
          depIds: node.todo.depIds || [],
        })
      }
      if (node.children?.length) flattenTodos(node.children, result)
    }
  }

  function getTreeNodes(data) {
    if (Array.isArray(data)) return data
    if (data?.todotree?.tree) return data.todotree.tree
    if (data?.tree) return data.tree
    return []
  }

  return {
    async setDependency({ node, filePath }) {
      try {
        const data = await api.getTree(filePath)
        const allTodos = []
        flattenTodos(getTreeNodes(data), allTodos)
        const targetInTree = allTodos.find(t => t.id === node.todo.id)
        return {
          ok: true,
          target: {
            id: node.todo.id,
            content: targetInTree?.content || node.todo.content,
            depIds: targetInTree?.depIds || [],
            filePath,
          },
          allTodos: allTodos.filter(t => t.id !== node.todo.id),
        }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async saveDeps({ todoId, depIds, filePath }) {
      try {
        const content = await api.readFile(filePath)
        const data = JSON.parse(content)
        const todotree = data.todotree

        const allTodos = []
        flattenTodos(todotree.tree, allTodos)
        const existingIds = new Set(allTodos.map(t => t.id))
        const validDepIds = depIds.filter(id => existingIds.has(id))

        function findAndUpdate(nodes) {
          for (const node of nodes) {
            if (node.todo && node.todo.id === todoId) {
              if (validDepIds.length > 0) {
                node.todo.depIds = validDepIds
              } else {
                delete node.todo.depIds
              }
              return true
            }
            if (node.children?.length && findAndUpdate(node.children)) return true
          }
          return false
        }

        findAndUpdate(todotree.tree)
        await api.store('todotree', todotree, filePath)
        await api.reload(filePath)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async toggleFocus({ todoId, focus, filePath }) {
      try {
        const content = await api.readFile(filePath)
        const data = JSON.parse(content)
        const todotree = data.todotree

        function findAndUpdate(nodes) {
          for (const node of nodes) {
            if (node.todo && node.todo.id === todoId) {
              node.todo.focus = focus
              return true
            }
            if (node.children?.length && findAndUpdate(node.children)) return true
          }
          return false
        }

        findAndUpdate(todotree.tree)
        await api.store('todotree', todotree, filePath)
        await api.reload(filePath)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async toggleDone({ todoId, done, filePath }) {
      try {
        const content = await api.readFile(filePath)
        const data = JSON.parse(content)
        const todotree = data.todotree

        function findAndUpdate(nodes) {
          for (const node of nodes) {
            if (node.todo && node.todo.id === todoId) {
              node.todo.done = done
              if (done) {
                node.todo.end = Date.now()
                node.todo.focus = false
              } else {
                delete node.todo.end
              }
              return true
            }
            if (node.children?.length && findAndUpdate(node.children)) return true
          }
          return false
        }

        findAndUpdate(todotree.tree)
        await api.store('todotree', todotree, filePath)
        await api.reload(filePath)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async autoDependency({ node, filePath }) {
      try {
        const content = await api.readFile(filePath)
        const data = JSON.parse(content)
        const tree = getTreeNodes(data)
        const targetId = node.todo.id

        function collectAutoDepPairs(nodes) {
          const pairs = []
          for (const n of nodes) {
            if (!n.todo || !n.children?.length) continue
            const childIds = n.children.filter(c => c.todo).map(c => c.todo.id)
            if (childIds.length) {
              pairs.push({ id: n.todo.id, content: n.todo.content, depIds: childIds })
            }
            pairs.push(...collectAutoDepPairs(n.children))
          }
          return pairs
        }

        function findNode(nodes, id) {
          for (const n of nodes) {
            if (n.todo?.id === id) return n
            if (n.children?.length) {
              const found = findNode(n.children, id)
              if (found) return found
            }
          }
          return null
        }

        const targetNode = findNode(tree, targetId)
        if (!targetNode || !targetNode.children?.length) {
          return { ok: true, result: { pairs: [], filePath } }
        }

        const pairs = collectAutoDepPairs([targetNode])

        const allTodos = []
        flattenTodos(tree, allTodos)
        const todoMap = {}
        for (const t of allTodos) todoMap[t.id] = t

        const pairsWithNames = pairs.map(p => ({
          ...p,
          deps: p.depIds.map(id => ({ id, content: todoMap[id]?.content || '#' + id })),
        }))

        return { ok: true, result: { pairs: pairsWithNames, filePath } }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async applyAutoDeps({ pairs, filePath }) {
      try {
        const content = await api.readFile(filePath)
        const data = JSON.parse(content)
        const todotree = data.todotree

        function findAndSetDeps(nodes, id, depIds) {
          for (const n of nodes) {
            if (n.todo?.id === id) {
              if (depIds.length) n.todo.depIds = depIds
              else delete n.todo.depIds
              return true
            }
            if (n.children?.length && findAndSetDeps(n.children, id, depIds)) return true
          }
          return false
        }

        for (const p of pairs) {
          findAndSetDeps(todotree.tree, p.id, p.depIds)
        }

        await api.store('todotree', todotree, filePath)
        await api.reload(filePath)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async scanAllDeps({ filePath }) {
      try {
        const data = await api.getTree(filePath)
        const todos = []
        flattenTodos(getTreeNodes(data), todos)

        const edges = []
        const involvedIds = new Set()
        const todoMap = {}

        for (const t of todos) {
          todoMap[t.id] = t
          if (t.depIds?.length) {
            involvedIds.add(t.id)
            for (const depId of t.depIds) {
              involvedIds.add(depId)
              edges.push([depId, t.id])
            }
          }
        }

        const involved = {}
        for (const id of involvedIds) {
          if (todoMap[id]) involved[id] = todoMap[id]
        }

        return { ok: true, result: { todos: involved, edges } }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },
  }
}
