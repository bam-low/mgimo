"use client";
import { useEffect } from "react";
/** Keep native form feedback Russian even when the browser UI uses English. */
export function RussianValidation() {
  useEffect(() => {
    type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const field = (target: EventTarget | null): target is Field =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
    function invalid(event: Event) {
      const input = event.target;
      if (!field(input) || input.validity.customError) return;
      const validity = input.validity;
      let text = "Проверьте значение этого поля.";
      if (validity.valueMissing)
        text =
          input instanceof HTMLSelectElement
            ? "Выберите значение из списка."
            : input instanceof HTMLInputElement && input.type === "checkbox"
              ? "Подтвердите это условие."
              : "Заполните это поле.";
      else if (validity.tooShort && "minLength" in input)
        text = `Введите не менее ${input.minLength} символов.`;
      else if (validity.tooLong && "maxLength" in input)
        text = `Введите не более ${input.maxLength} символов.`;
      else if (validity.typeMismatch)
        text = "Проверьте формат введённого значения.";
      else if (validity.rangeUnderflow || validity.rangeOverflow)
        text = "Значение выходит за допустимые границы.";
      else if (validity.stepMismatch || validity.badInput)
        text = "Введите допустимое числовое значение.";
      input.setCustomValidity(text);
      input.dataset.campusRussianValidity = "true";
    }
    function clear(event: Event) {
      const input = event.target;
      if (field(input) && input.dataset.campusRussianValidity) {
        input.setCustomValidity("");
        delete input.dataset.campusRussianValidity;
      }
    }
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, []);
  return null;
}
