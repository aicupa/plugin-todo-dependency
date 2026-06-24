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

        function findAndUpdate(nodes) {
          for (const node of nodes) {
            if (node.todo && node.todo.id === todoId) {
              if (depIds.length > 0) {
                node.todo.depIds = depIds
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
                node.todo.doneAt = Date.now()
              } else {
                delete node.todo.doneAt
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
