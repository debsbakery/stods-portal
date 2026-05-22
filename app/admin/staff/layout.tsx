import PinProtected from '@/components/ui/pin-protected'
export default function L({ children }: { children: React.ReactNode }) {
  return <PinProtected>{children}</PinProtected>
}