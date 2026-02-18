import { Navigate } from "react-router-dom";
import { ValidatorDashboard } from "@/components/validator/ValidatorDashboard";

const Index = () => {
  const defaultPage = localStorage.getItem("defaultPage");

  if (defaultPage === "portfolio") {
    return <Navigate to="/portfolio" replace />;
  }

  return <ValidatorDashboard />;
};

export default Index;
