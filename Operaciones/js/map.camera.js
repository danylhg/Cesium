export function configureGoogleLikeCamera(viewer) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!controller) return;

  controller.minimumZoomDistance = 500;
  controller.maximumZoomDistance = 5000000;

  controller.inertiaSpin = 0.35;
  controller.inertiaTranslate = 0.35;
  controller.inertiaZoom = 0.25;
  controller.maximumMovementRatio = 0.08;

  if ("zoomFactor" in controller) {
    controller.zoomFactor = 2.2;
  }

  controller.enableRotate = true;
  controller.enableTranslate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableLook = false;
}
