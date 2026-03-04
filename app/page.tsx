import KunaiHero from "@/components/KunaiHero";
import KunaiProcess from "@/components/KunaiProcess";
import KunaiServices from "@/components/KunaiServices";
import KunaiLogos from "@/components/KunaiLogos";
import KunaiFAQ from "@/components/KunaiFAQ";
import KunaiFooter from "@/components/KunaiFooter";
import KunaiNav from "@/components/KunaiNav";

export default function Home() {
  return (
    <main className="relative">
      <KunaiNav />
      <KunaiHero />
      <KunaiProcess />
      <KunaiServices />
      <KunaiLogos />
      <KunaiFAQ />
      <KunaiFooter />
    </main>
  );
}
