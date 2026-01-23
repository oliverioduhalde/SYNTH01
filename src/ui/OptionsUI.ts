export class OptionsUI {
  private panel = document.getElementById("options") as HTMLDivElement;
  private musicSlider = document.getElementById("music") as HTMLInputElement;
  private fxSlider = document.getElementById("fx") as HTMLInputElement;
  private musicButton = this.panel.querySelector("[data-toggle=music]") as HTMLButtonElement;
  private fxButton = this.panel.querySelector("[data-toggle=fx]") as HTMLButtonElement;

  musicVolume = 0.5;
  fxVolume = 0.7;
  musicOn = true;
  fxOn = true;

  constructor() {
    this.musicSlider.addEventListener("input", () => {
      this.musicVolume = parseFloat(this.musicSlider.value);
    });
    this.fxSlider.addEventListener("input", () => {
      this.fxVolume = parseFloat(this.fxSlider.value);
    });
    this.musicButton.addEventListener("click", () => {
      this.musicOn = !this.musicOn;
      this.musicButton.textContent = this.musicOn ? "MUSIC ON" : "MUSIC OFF";
    });
    this.fxButton.addEventListener("click", () => {
      this.fxOn = !this.fxOn;
      this.fxButton.textContent = this.fxOn ? "FX ON" : "FX OFF";
    });
  }

  toggle(show: boolean): void {
    this.panel.style.display = show ? "grid" : "none";
  }
}
