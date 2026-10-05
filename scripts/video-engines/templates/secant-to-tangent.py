"""A native mathematical explanation. Edit the source, then render its job file."""
import json
import os
import manimpango
from manim import (
    Scene, Text, MathTypst, Axes, VGroup, Dot, Line, ValueTracker,
    DecimalNumber, Create, FadeIn, TransformMatchingShapes, always_redraw,
    UP, DOWN, LEFT, RIGHT, smooth,
)


class SecantToTangent(Scene):
    def construct(self):
        theme = json.loads(os.environ["ARTIFACTURE_NATIVE_THEME"])
        manimpango.register_font(os.environ["ARTIFACTURE_NATIVE_FONT"])
        ink, muted, accent = theme["text"], theme["ink"], theme["accent"]
        stroke = theme["stroke"]
        title = Text("From a secant to a tangent.", font=theme["displayFont"], font_size=38, color=ink).to_edge(UP, buff=0.55)
        axes = Axes(
            x_range=[-0.5, 2.5, 0.5], y_range=[0, 6, 1], x_length=7.3,
            y_length=4.5, tips=False,
            axis_config={"color": muted, "stroke_width": stroke},
        ).shift(LEFT * 2.15 + DOWN * 0.35)
        graph = axes.plot(lambda x: x*x, x_range=[-0.35, 2.35], color=muted, stroke_width=stroke * 1.25)
        function = MathTypst("f(x) = x^2", color=ink, font_size=42).move_to(RIGHT * 4.0 + UP * 1.45)
        quotient = MathTypst("(f(x + h) - f(x)) / h", color=ink, font_size=34).move_to(RIGHT * 4.0 + UP * 0.25)
        h = ValueTracker(1.2)
        fixed = Dot(axes.c2p(1, 1), radius=0.065, color=accent)
        moving = always_redraw(lambda: Dot(axes.c2p(1+h.get_value(), (1+h.get_value())**2), radius=0.065, color=accent))
        secant = always_redraw(lambda: Line(
            axes.c2p(0.7, 1 + (2+h.get_value()) * (0.7-1)),
            axes.c2p(2.15, 1 + (2+h.get_value()) * (2.15-1)),
            color=accent, stroke_width=stroke * 1.6,
        ))
        label = MathTypst("h =", color=ink, font_size=32)
        number = DecimalNumber(1.2, num_decimal_places=2, mob_class=Text, color=accent, font_size=32)
        value = VGroup(label, number).arrange(RIGHT, buff=0.18).move_to(RIGHT * 4.0 + DOWN * 0.9)
        number.add_updater(lambda item: item.set_value(h.get_value()))
        self.play(FadeIn(title), Create(axes), run_time=1.2)
        self.play(Create(graph), FadeIn(function), run_time=1.3)
        self.play(FadeIn(quotient), FadeIn(value), FadeIn(fixed), FadeIn(moving), Create(secant), run_time=1.2)
        self.wait(0.8)
        self.play(h.animate.set_value(0.02), run_time=5, rate_func=smooth)
        self.wait(0.7)
        derivative = MathTypst("f'(x) = 2x", color=ink, font_size=40).move_to(quotient)
        self.play(TransformMatchingShapes(quotient, derivative), run_time=1.2)
        consequence = Text("The two points meet. The slope remains.", font=theme["displayFont"], font_size=26, color=ink).to_edge(DOWN, buff=0.45)
        self.play(FadeIn(consequence), run_time=0.6)
        self.wait(2)
