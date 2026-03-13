import { useRef, useState, useCallback, useEffect } from 'react'
import * as faceapi from 'face-api.js'
import './App.css'

type Status = 'idle' | 'loading-model' | 'detecting' | 'done' | 'error'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [scale, setScale] = useState(1.2)
  const [dragging, setDragging] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)

  const imageRef = useRef<HTMLImageElement | null>(null)
  const landmarksRef = useRef<faceapi.FaceLandmarks68[]>([])

  const loadModels = async () => {
    if (modelsLoaded) return
    setStatus('loading-model')
    const MODEL_URL = import.meta.env.BASE_URL + 'models'
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
    setModelsLoaded(true)
  }

  const drawResult = useCallback((img: HTMLImageElement, landmarks: faceapi.FaceLandmarks68[], eyeScale: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)

    for (const lm of landmarks) {
      const leftEye = lm.getLeftEye()
      const rightEye = lm.getRightEye()

      for (const eyePoints of [leftEye, rightEye]) {
        const xs = eyePoints.map(p => p.x)
        const ys = eyePoints.map(p => p.y)
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2
        const rx = ((Math.max(...xs) - Math.min(...xs)) / 2) * eyeScale
        const ry = ((Math.max(...ys) - Math.min(...ys)) / 2) * eyeScale

        ctx.save()
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.restore()
      }
    }
  }, [])

  const processImage = async (file: File) => {
    try {
      await loadModels()
      setStatus('detecting')

      const img = new Image()
      const url = URL.createObjectURL(file)
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
        img.src = url
      })

      imageRef.current = img

      const detections = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)

      if (detections.length === 0) {
        setErrorMsg('顔が検出されませんでした。別の写真を試してください。')
        setStatus('error')
        URL.revokeObjectURL(url)
        return
      }

      const landmarks = detections.map(d => d.landmarks)
      landmarksRef.current = landmarks

      drawResult(img, landmarks, scale)
      setStatus('done')
      URL.revokeObjectURL(url)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '処理中にエラーが発生しました')
      setStatus('error')
    }
  }

  useEffect(() => {
    if (status === 'done' && imageRef.current && landmarksRef.current.length > 0) {
      drawResult(imageRef.current, landmarksRef.current, scale)
    }
  }, [scale, status, drawResult])

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('画像ファイルを選択してください')
      setStatus('error')
      return
    }
    setErrorMsg('')
    processImage(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'shirome.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleReset = () => {
    setStatus('idle')
    setScale(1.2)
    setErrorMsg('')
    imageRef.current = null
    landmarksRef.current = []
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">白目</h1>
        <p className="subtitle">白目にしたい写真をアップしてください</p>
      </header>

      {status === 'idle' && (
        <>
          <div
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="drop-zone-icon">+</div>
            <div className="drop-zone-text">
              クリックまたはドラッグ&ドロップ
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </>
      )}

      {(status === 'loading-model' || status === 'detecting') && (
        <div className="loading">
          <div className="spinner" />
          <div className="loading-text">
            {status === 'loading-model' ? 'モデルを読み込み中...' : '顔を検出中...'}
          </div>
        </div>
      )}

      {status === 'error' && (
        <>
          <p className="error-text">{errorMsg}</p>
          <button className="btn btn-secondary" onClick={handleReset}>
            やり直す
          </button>
        </>
      )}

      {status === 'done' && (
        <div className="canvas-area">
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} />
          </div>

          <div className="controls">
            <div className="slider-row">
              <span className="slider-label">白目サイズ</span>
              <input
                type="range"
                min="0.8"
                max="2.0"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
              />
              <span className="slider-value">{scale.toFixed(2)}</span>
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={handleDownload}>
              ダウンロード
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>
              別の写真
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
