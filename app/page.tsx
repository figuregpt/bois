import BoisHero from "@/components/BoisHero";
import BoisProcess from "@/components/BoisProcess";
import BoisManifesto from "@/components/BoisManifesto";
import BoisServices from "@/components/BoisServices";
import BoisLogos from "@/components/BoisLogos";
import BoisFAQ from "@/components/BoisFAQ";
import BoisFooter from "@/components/BoisFooter";
import BoisNav from "@/components/BoisNav";

export default function Home() {
  return (
    <main className="relative">
      <BoisNav />
      <BoisHero />
      <BoisManifesto />
      <BoisProcess />
      <BoisServices />
      <BoisLogos />
      <BoisFAQ />
      <BoisFooter />
    </main>
  );
}
