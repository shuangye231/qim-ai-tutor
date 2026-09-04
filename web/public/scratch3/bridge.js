(() => {
  const parentOrigin = location.origin
  const host = document.getElementById('scratch-editor')
  let vm = null
  let saveTimer = 0
  let saving = false
  let saveAgain = false
  let loadingProject = false

  const send = (message, transfer = []) => parent.postMessage(message, parentOrigin, transfer)
  const fail = (error) => send({ type: 'scratch-error', message: error instanceof Error ? error.message : String(error) })

  const projectContext = () => {
    const targets = (vm?.runtime?.targets || []).map((target) => {
      const variables = Object.values(target.variables || {}).map((variable) => ({
        name: variable.name,
        type: variable.type || 'variable',
        value: variable.value,
      }))
      const blocks = Object.values(target.blocks?._blocks || {}).slice(0, 160).map((block) => ({
        opcode: block.opcode,
        fields: block.fields,
        inputs: block.inputs,
        next: block.next,
        topLevel: block.topLevel,
      }))
      return {
        name: target.isStage ? '舞台' : target.getName(),
        isStage: target.isStage,
        x: target.x,
        y: target.y,
        direction: target.direction,
        visible: target.visible,
        costume: target.getCostumes?.()[target.currentCostume]?.name || '',
        variables,
        blocks,
      }
    })
    return {
      editor: 'Scratch 3',
      runningScripts: vm?.runtime?.threads?.length || 0,
      targets,
    }
  }

  const sendContext = (requestId) => send({ type: 'scratch-context', context: projectContext(), requestId })

  const serializeProject = async () => {
    const project = await vm.saveProjectSb3()
    return project instanceof Blob
      ? await project.arrayBuffer()
      : project instanceof ArrayBuffer
        ? project
        : project.buffer.slice(project.byteOffset, project.byteOffset + project.byteLength)
  }

  const saveProject = async () => {
    if (!vm || loadingProject) return
    if (saving) {
      saveAgain = true
      return
    }
    saving = true
    try {
      const buffer = await serializeProject()
      send({ type: 'scratch-project', project: buffer }, [buffer])
      sendContext()
    } catch (error) {
      fail(error)
    } finally {
      saving = false
      if (saveAgain) {
        saveAgain = false
        scheduleSave()
      }
    }
  }

  const scheduleSave = () => {
    if (loadingProject) return
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(saveProject, 1800)
  }

  const loadDefaultProject = () => {
    loadingProject = true
    const timeout = window.setTimeout(() => {
      loadingProject = false
      fail(new Error('默认小猫项目加载超时'))
    }, 10000)
    vm.runtime.once('PROJECT_LOADED', () => {
      clearTimeout(timeout)
      loadingProject = false
      sendContext()
      send({ type: 'scratch-loaded' })
      scheduleSave()
    })
    vm.downloadProjectId(0)
  }

  const state = new window.GUI.EditorState({ locale: 'zh-cn' })
  window.GUI.setAppElement(host)
  window.GUI.createStandaloneRoot(state, host).render({
    canEditTitle: true,
    canSave: false,
    backpackVisible: false,
    showComingSoon: false,
    onClickLogo: () => {},
  })

  const connect = () => {
    vm = state.store.getState()?.scratchGui?.vm
    if (!vm?.runtime) {
      window.setTimeout(connect, 100)
      return
    }
    vm.on('PROJECT_CHANGED', scheduleSave)
    send({ type: 'scratch-ready' })
  }

  window.addEventListener('message', async (event) => {
    if (event.origin !== parentOrigin || event.source !== parent || !vm) return
    if (event.data?.type === 'get-context') sendContext(event.data.requestId)
    if (event.data?.type === 'export-project') {
      try {
        const project = await serializeProject()
        send({ type: 'scratch-export', project }, [project])
      } catch (error) {
        fail(error)
      }
    }
    if (event.data?.type === 'save-project') scheduleSave()
    if (event.data?.type === 'load-default') loadDefaultProject()
    if (event.data?.type === 'load-project' && event.data.project) {
      loadingProject = true
      try {
        await vm.loadProject(event.data.project)
        sendContext()
        send({ type: 'scratch-loaded' })
      } catch (error) {
        fail(error)
      } finally {
        loadingProject = false
      }
    }
  })

  window.addEventListener('beforeunload', () => {
    if (vm) saveProject()
  })
  connect()
})()
