"""
3D Visualization of ADAS-Cog Data using Plotly
Dimensions: PARAMCD, AVISITN
Measure: AVAL (mean)

Run: python adqsadas_3d_plotly.py
Requires: pip install plotly pandas
"""

import os
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Load data - use path relative to script location
script_dir = os.path.dirname(os.path.abspath(__file__))
df = pd.read_csv(os.path.join(script_dir, 'ac', 'adqsadas_ac.csv'))

# Create pivot table: PARAMCD x AVISITN with mean AVAL
pivot = df.pivot_table(
    values='AVAL',
    index='PARAMCD',
    columns='AVISITN',
    aggfunc='mean'
).round(2)

pivot = pivot.sort_index()
pivot = pivot[sorted(pivot.columns)]

# Prepare data for 3D surface
x_labels = [f"Week {int(v)}" if v > 0 else "Baseline" for v in pivot.columns]
y_labels = list(pivot.index)
z_values = pivot.values

# Create 3D Surface Plot
fig = go.Figure()

fig.add_trace(go.Surface(
    x=list(range(len(x_labels))),
    y=list(range(len(y_labels))),
    z=z_values,
    colorscale='Viridis',
    colorbar=dict(title='Mean AVAL'),
    hovertemplate=(
        'Visit: %{customdata[0]}<br>'
        'PARAMCD: %{customdata[1]}<br>'
        'Mean AVAL: %{z:.2f}<extra></extra>'
    ),
    customdata=[
        [[x_labels[j], y_labels[i]] for j in range(len(x_labels))]
        for i in range(len(y_labels))
    ]
))

fig.update_layout(
    title=dict(
        text='ADAS-Cog: Mean AVAL by PARAMCD and Visit',
        font=dict(size=18)
    ),
    scene=dict(
        xaxis=dict(
            title='Visit',
            tickvals=list(range(len(x_labels))),
            ticktext=x_labels
        ),
        yaxis=dict(
            title='PARAMCD',
            tickvals=list(range(len(y_labels))),
            ticktext=y_labels
        ),
        zaxis=dict(title='Mean AVAL'),
        camera=dict(eye=dict(x=1.5, y=1.5, z=1.2))
    ),
    width=900,
    height=700,
    margin=dict(l=50, r=50, t=80, b=50)
)

# Save as interactive HTML
fig.write_html('adqsadas_3d_surface.html')
print("Saved: adqsadas_3d_surface.html")

# Create grouped bar chart as 2D alternative
fig_bars = go.Figure()

colors = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA']

for j, (visit, col_name) in enumerate(zip(pivot.columns, x_labels)):
    fig_bars.add_trace(go.Bar(
        name=col_name,
        x=y_labels,
        y=pivot[visit].values,
        marker_color=colors[j % len(colors)]
    ))

fig_bars.update_layout(
    title='ADAS-Cog: Mean AVAL by PARAMCD and Visit (Grouped Bar)',
    xaxis_title='PARAMCD',
    yaxis_title='Mean AVAL',
    barmode='group',
    width=1000,
    height=500
)

fig_bars.write_html('adqsadas_grouped_bar.html')
print("Saved: adqsadas_grouped_bar.html")

# Create a true 3D scatter/mesh representation
import numpy as np

x_mesh, y_mesh = np.meshgrid(range(len(x_labels)), range(len(y_labels)))

fig_3d = go.Figure(data=[
    go.Surface(
        x=x_mesh,
        y=y_mesh,
        z=z_values,
        colorscale='RdYlBu_r',
        colorbar=dict(title='Mean AVAL', x=1.02),
        contours=dict(
            z=dict(show=True, usecolormap=True, highlightcolor="white", project_z=True)
        )
    )
])

fig_3d.update_layout(
    title=dict(
        text='ADAS-Cog Data Cube: PARAMCD × AVISITN × AVAL',
        font=dict(size=18)
    ),
    scene=dict(
        xaxis=dict(
            title='Visit (AVISITN)',
            tickvals=list(range(len(x_labels))),
            ticktext=x_labels,
            backgroundcolor='rgb(230,230,230)'
        ),
        yaxis=dict(
            title='Parameter (PARAMCD)',
            tickvals=list(range(len(y_labels))),
            ticktext=y_labels,
            backgroundcolor='rgb(230,230,230)'
        ),
        zaxis=dict(
            title='Mean AVAL',
            backgroundcolor='rgb(230,230,230)'
        ),
        camera=dict(
            eye=dict(x=1.8, y=1.8, z=1.0)
        )
    ),
    width=950,
    height=750,
    margin=dict(l=20, r=20, t=80, b=20)
)

fig_3d.write_html('adqsadas_datacube.html')
print("Saved: adqsadas_datacube.html")

# 3D Point Cloud - ACTOT Total Score by Treatment
fig_scatter = go.Figure()

# Filter to ACTOT only
df_actot = df[df['PARAMCD'] == 'ACTOT'].copy()

# Map TRTP to numeric values for Y axis
trtp_list = sorted(df_actot['TRTP'].unique())
trtp_map = {t: i for i, t in enumerate(trtp_list)}

# Map USUBJID to numeric values for Z axis
usubjid_list = sorted(df_actot['USUBJID'].unique())
usubjid_map = {u: i for i, u in enumerate(usubjid_list)}

# Add all points as single trace, colored by AVAL
fig_scatter.add_trace(go.Scatter3d(
    x=df_actot['AVISITN'],
    y=df_actot['TRTP'].map(trtp_map),
    z=df_actot['USUBJID'].map(usubjid_map),
    mode='markers',
    marker=dict(
        size=4,
        opacity=0.6,
        color=df_actot['AVAL'],
        colorscale='Viridis',
        colorbar=dict(title='AVAL')
    ),
    hovertemplate=(
        'Subject: %{text}<br>'
        'Visit: Week %{x}<br>'
        'Treatment: %{customdata}<br>'
        'AVAL: %{marker.color:.2f}<extra></extra>'
    ),
    customdata=df_actot['TRTP'],
    text=df_actot['USUBJID']
))

fig_scatter.update_layout(
    title='ADAS-Cog Total (ACTOT): Individual Subject Data by Treatment',
    scene=dict(
        xaxis=dict(title='Visit (AVISITN)'),
        yaxis=dict(title='Treatment (TRTP)',
                   tickvals=list(range(len(trtp_list))),
                   ticktext=trtp_list),
        zaxis=dict(title='Subject (USUBJID)'),
        camera=dict(eye=dict(x=1.8, y=1.8, z=1.0))
    ),
    width=950,
    height=750
)

fig_scatter.write_html('adqsadas_3d_scatter.html')
print("Saved: adqsadas_3d_scatter.html")

# Show the 3D scatter plot
fig_scatter.show()
