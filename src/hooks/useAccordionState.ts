import { useState, useEffect } from "react";

export const useAccordionState = (validatorsLength: number) => {
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  useEffect(() => {
    const savedAccordionState = localStorage.getItem("accordionState");
    if (savedAccordionState) {
      try {
        setOpenAccordions(JSON.parse(savedAccordionState));
      } catch (error) {
        console.error("Error loading accordion state:", error);
      }
    }
  }, []);

  useEffect(() => {
    if (openAccordions.length > 0 || validatorsLength > 0) {
      localStorage.setItem("accordionState", JSON.stringify(openAccordions));
    }
  }, [openAccordions, validatorsLength]);

  return { openAccordions, setOpenAccordions };
};
