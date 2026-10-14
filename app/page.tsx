import { LandingHeader } from '@/components/landing/LandingHeader';
import { Hero } from '@/components/landing/Hero';
import { Footer } from '@/components/landing/Footer';

export default function HomePage() {
  return (
    <div className="landing-container">
      <LandingHeader />
      <main>
        <Hero />
      </main>
      <Footer />
    </div>
  );
}
