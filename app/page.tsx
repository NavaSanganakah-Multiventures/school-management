import registry from '../schools.json';
import {LandingPage, PortfolioSchool} from '@/components/website/landing';

export default function HomePage() {
  const schools: PortfolioSchool[] = (registry.schools || [])
    .filter((s: any) => s && s.mode === 'dedicated')
    .map((s: any) => ({
      slug: String(s.slug || ''),
      name: String(s.name || s.slug || 'स्कूल'),
      domain: String(s.domain || (s.slug + '.pragnya.nasven.com')),
    }));

  return <LandingPage schools={schools} />;
}