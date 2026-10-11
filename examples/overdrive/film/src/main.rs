use fframes::{CombinedMediaProvider, MediaDirectory, MediaProvider, EncoderOptions, RenderOptions, StaticMediaProvider, cli};
use fframes_skia_renderer::{
    SkiaFFramesRenderer, SkiaPipelineConcurrencyPolicy, SkiaPipelineConfig,
    metal::SkiaMetalCtx,
};
use film::{ FilmMedia, FilmVideo, HEIGHT, WIDTH };
use fframes::cli::clap; // the derive below expands to `clap::...`
use std::process::ExitCode;

/// Flags of this video next to the standard ones of `fframes::cli` (render, frame, strip,
/// inspect, audio, ...). Run `cargo run --release -- --help`.
#[derive(Debug, clap::Args)]
struct VideoArgs {
    #[arg(long, default_value = "Film", global = true)]
    title: String,
}

fn main() -> ExitCode {
    let args = cli::parse::<VideoArgs>();
    let media = FilmMedia::prepare().expect("media");
    let directory = MediaDirectory::read_folder(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("dynamic_media")).expect("dynamic media folder");
    let dynamic = directory.process_media_source().expect("dynamic media");
    let all = CombinedMediaProvider::from([&media as &dyn MediaProvider, &dynamic]);
    let title = args.app.title.clone();
    let video = FilmVideo::new(&media, &title);
    let gpu = SkiaMetalCtx::new(WIDTH, HEIGHT).expect("GPU context");

    cli::new(
        &video,
        RenderOptions {
            media: Some(&all),
            video_encoder_options: EncoderOptions {
                preferred_encoder: Some("libx264"),
                codec_params: Some(&[("crf", "20"), ("preset", "medium"), ("tune", "animation")]),
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .args(args)
    // Frame previews (frame, strip, onion, snapshot) render with the same Skia backend.
    .backend(
        SkiaFFramesRenderer::new_metal(
            &gpu,
            SkiaPipelineConfig {
                concurrency_policy: SkiaPipelineConcurrencyPolicy::MaxPerformance,
                ..Default::default()
            },
        )
        .expect("skia renderer"),
    )
    // `preview` opens the real-time GPU player.
    .preview(fframes_native_player::cli_preview)
    .run()
}
