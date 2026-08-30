import LegalPage, { legalMetadata } from "@/components/LegalPage";

export const generateMetadata = () => legalMetadata("Terms of Service");

export default function TermsPage() {
  return <LegalPage title="Terms of Service" field="terms" />;
}
