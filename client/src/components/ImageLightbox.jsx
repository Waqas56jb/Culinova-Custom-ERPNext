import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Full-screen image viewer — click anywhere (or X) to close.
export default function ImageLightbox({ src, onClose }) {
  if (!src) return null
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <button onClick={onClose} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={20} /></button>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" />
    </div>,
    document.body,
  )
}
