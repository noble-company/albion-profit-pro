import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react'
type ToastContextValue = { toast: (message: string) => void }
const ToastContext = createContext<ToastContextValue | null>(null)
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<string | null>(null)
  return (
    <ToastContext.Provider value={{ toast: setMessage }}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-lg bg-stone-800 px-4 py-3 text-sm text-white shadow-xl"
        >
          <span>{message}</span>
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            Fechar
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}
export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return value
}
