import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";
import Splash from "@/components/Splash";

export default function Home() {
  return (
    <main className="relative">
      <Splash />
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />

      <Footer />
    </main>
  );
}
