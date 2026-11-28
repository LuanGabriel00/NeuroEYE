import csv
from pathlib import Path
from typing import List

from mapping.gaze_mapper import TrackingPoint


def save_csv(points: List[TrackingPoint], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "tracking_points.csv"
    with path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["time_seconds", "object_position", "eye_position"])
        for p in points:
            writer.writerow([p.time_seconds, p.object_position, p.eye_position])
    return path


def summarize(points: List[TrackingPoint]) -> str:
    if not points:
        return "Nenhum ponto calculado (vídeo sem frames reconhecidos?)."

    duration = points[-1].time_seconds
    diffs = [abs(p.object_position - p.eye_position) for p in points]
    avg_diff = sum(diffs) / len(diffs)
    return (
        f"{len(points)} pontos, {duration:.1f}s de sessão.\n"
        f"Diferença média |objeto - olho|: {avg_diff:.2f} "
        f"(escala -1..1, onde 0 = exatamente alinhado; não é um limiar clínico, só uma medida bruta)"
    )


def save_plot(points: List[TrackingPoint], output_dir: Path) -> Path:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    times = [p.time_seconds for p in points]
    objects = [p.object_position for p in points]
    eyes = [p.eye_position for p in points]

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(times, objects, label="Objeto")
    ax.plot(times, eyes, label="Olho")
    ax.set_xlabel("Tempo (s)")
    ax.set_ylabel("Posição (-1 a 1)")
    ax.set_title("Posição do objeto vs. do olhar")
    ax.legend()

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "tracking_points.png"
    fig.savefig(path, dpi=120, bbox_inches="tight")
    plt.close(fig)
    return path


def save_results(points: List[TrackingPoint], output_dir: Path, plot: bool = False) -> None:
    csv_path = save_csv(points, output_dir)
    print(f"CSV salvo em {csv_path}")
    print(summarize(points))
    if plot:
        png_path = save_plot(points, output_dir)
        print(f"Gráfico salvo em {png_path}")
