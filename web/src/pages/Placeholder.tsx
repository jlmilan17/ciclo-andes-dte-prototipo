import { SectionTitle } from '@/components/Card';

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-6">
      <SectionTitle>{title}</SectionTitle>
      <p className="text-tinta-600">Pantalla en construcción.</p>
    </div>
  );
}
