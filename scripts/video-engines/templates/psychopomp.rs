//! An independently authored source-to-clip diagram using pinned Psychopomp APIs.
use psychopomp::{
    author::{PlanBuilder, SECOND},
    stage::{StageActor, StageElement, StagePlan, StagePost},
    tone::Tone,
};

fn main() -> anyhow::Result<()> {
    let plan = StagePlan {
        post: StagePost { bloom: 0.0, grain: 0.0, vignette: 0.0, backdrop: 0.0 },
        elements: vec![
            StageElement::label("question", [960.0, 180.0, 0.0], 46.0, &[("A connection is a path, not a jump.", Tone::Plain)]),
            StageElement::card("source", [410.0, 510.0, 0.0], [320.0, 150.0], "Editable source"),
            StageElement::card("composition", [960.0, 510.0, 0.0], [330.0, 150.0], "Composition"),
            StageElement::card("video", [1510.0, 510.0, 0.0], [300.0, 150.0], "Video"),
            StageElement::beam("prepare", "source", "composition").bend(-60.0),
            StageElement::beam("render", "composition", "video").bend(60.0),
            StageElement::packet("picture", "prepare").labeled("same picture").tone(Tone::Accent),
            StageElement::packet("frames", "render").labeled("authored frames").tone(Tone::Accent),
            StageElement::label("consequence", [960.0, 870.0, 0.0], 32.0, &[("The drawing survives. The output changes.", Tone::Plain)]),
        ],
    };
    let mut scene = PlanBuilder::new("source-to-clip", 8 * SECOND);
    let mut stage = StageActor::declare(&mut scene, "pipeline", &plan)?;
    stage.fade_in(&mut scene, "question", 0, 1.0, 0.6);
    stage.settle_in(&mut scene, "source", 0);
    stage.settle_in(&mut scene, "composition", SECOND / 4);
    stage.settle_in(&mut scene, "video", SECOND / 2);
    stage.connect(&mut scene, "prepare", SECOND, 0.8);
    let prepared = stage.send(&mut scene, "picture", 2 * SECOND, 1.1);
    stage.land(&mut scene, "composition", prepared);
    stage.twang(&mut scene, "prepare", prepared);
    stage.connect(&mut scene, "render", 4 * SECOND, 0.8);
    let delivered = stage.send(&mut scene, "frames", 5 * SECOND, 1.1);
    stage.land(&mut scene, "video", delivered);
    stage.twang(&mut scene, "render", delivered);
    stage.fade_in(&mut scene, "consequence", 6 * SECOND, 1.0, 0.6);
    scene.finish()?.write_or_print(std::env::args().nth(1))?;
    Ok(())
}
